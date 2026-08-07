#!/usr/bin/env python3
"""Purge low planned-risk pattern instances and rebuild pattern_statistics.

Matches the live fire gate (``TIP_PATTERN_MIN_RISK_R``, default 0.3):
  - Trade patterns with risk_r < min (or invalid rails) are deleted
  - Consolidation is kept
  - Open and closed instances are both eligible
  - ``pattern_events`` / ``pattern_outcomes`` cascade with the instance
  - ``pattern_statistics`` is wiped and fully rebuilt from remaining closed rows
  - Research stats need no rebuild (query-time over instances/outcomes)

Safety:
  - Defaults to --dry-run
  - Refuses non-local hosts unless --allow-remote is set

Usage (from backend/):
  python scripts/cleanup_low_risk_patterns.py
  python scripts/cleanup_low_risk_patterns.py --apply
  python scripts/cleanup_low_risk_patterns.py --apply --min-risk-r 0.3
  python scripts/cleanup_low_risk_patterns.py --url "postgresql+psycopg://..." --dry-run
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse


def _is_local_url(url: str) -> bool:
    try:
        u = urlparse(url.replace("postgresql+psycopg", "postgresql", 1))
    except Exception:
        return False
    host = (u.hostname or "").lower()
    return host in {"localhost", "127.0.0.1", "::1"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Purge low-risk patterns + rebuild stats")
    parser.add_argument(
        "--url",
        default=os.environ.get("DATABASE_URL")
        or os.environ.get("TIP_DATABASE_URL")
        or "",
        help="SQLAlchemy database URL",
    )
    parser.add_argument(
        "--min-risk-r",
        type=float,
        default=float(os.environ.get("TIP_PATTERN_MIN_RISK_R", "0.3")),
        help="Delete instances with planned risk_r below this (default 0.3)",
    )
    parser.add_argument(
        "--dry-run",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Report only (default). Use --no-dry-run or --apply to write.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Shorthand for --no-dry-run (actually delete + rebuild stats)",
    )
    parser.add_argument(
        "--allow-remote",
        action="store_true",
        help="Allow non-localhost DATABASE_URL (required for prod/Neon)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional max instances to delete (0 = no limit)",
    )
    args = parser.parse_args()
    if args.apply:
        args.dry_run = False

    url = (args.url or "").strip()
    if not url:
        print("ERROR: provide --url or DATABASE_URL / TIP_DATABASE_URL", file=sys.stderr)
        return 1
    if not _is_local_url(url) and not args.allow_remote:
        print(
            "ERROR: URL host is not localhost. Refusing remote cleanup.\n"
            "  Re-run with --allow-remote only when you intend prod/Neon.",
            file=sys.stderr,
        )
        return 2

    min_r = float(args.min_risk_r)
    if min_r < 0:
        print("ERROR: --min-risk-r must be >= 0", file=sys.stderr)
        return 1

    backend_root = Path(__file__).resolve().parents[1]
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))

    from sqlalchemy import select, text

    from app.db.session import create_engine_and_session
    from app.journal.entities import PatternInstanceRow, PatternOutcomeRow, PatternStatisticsRow
    from app.journal.mapper import to_domain
    from app.journal.postgres_journal import PostgresPatternJournal
    from app.patterns.planned_rails import passes_min_risk_r, planned_rails_from_pattern

    engine, sf = create_engine_and_session(url)
    journal = PostgresPatternJournal(sf)

    print(f"URL host local={_is_local_url(url)}  dry_run={args.dry_run}  min_risk_r={min_r}")

    with sf() as s:
        before = {
            "instances": s.execute(text("SELECT count(*) FROM pattern_instances")).scalar(),
            "events": s.execute(text("SELECT count(*) FROM pattern_events")).scalar(),
            "outcomes": s.execute(text("SELECT count(*) FROM pattern_outcomes")).scalar(),
            "stats_rows": s.execute(text("SELECT count(*) FROM pattern_statistics")).scalar(),
            "stats_sample_sum": s.execute(
                text("SELECT coalesce(sum(sample_size),0) FROM pattern_statistics")
            ).scalar(),
        }
        instances = list(s.scalars(select(PatternInstanceRow)).all())

    to_purge: list[tuple] = []
    by_type: Counter[str] = Counter()
    by_status: Counter[str] = Counter()
    risk_samples: list[float] = []

    for inst in instances:
        try:
            p = to_domain(inst)
        except Exception as exc:  # noqa: BLE001
            print(f"  skip unreadable instance {inst.id}: {exc}")
            continue
        if passes_min_risk_r(p, min_r):
            continue
        rails = planned_rails_from_pattern(p)
        risk = float(rails.risk_r) if rails is not None else None
        to_purge.append((inst.id, inst.symbol_id, inst.pattern_type, inst.timeframe, inst.status, risk))
        by_type[inst.pattern_type] += 1
        by_status[inst.status] += 1
        if risk is not None:
            risk_samples.append(risk)

    if args.limit and args.limit > 0:
        to_purge = to_purge[: args.limit]

    print("\n=== BEFORE ===")
    for k, v in before.items():
        print(f"  {k}: {v}")

    print(f"\n=== PURGE CANDIDATES (risk_r < {min_r} or invalid rails; excl. consolidation) ===")
    print(f"  count: {len(to_purge)}")
    print(f"  by_type: {dict(by_type)}")
    print(f"  by_status: {dict(by_status)}")
    if risk_samples:
        print(
            f"  risk_r among measurable: "
            f"min={min(risk_samples):.4f} max={max(risk_samples):.4f} "
            f"avg={sum(risk_samples)/len(risk_samples):.4f}"
        )
    # sample first 15
    for row in to_purge[:15]:
        pid, sid, ptype, tf, status, risk = row
        rs = f"{risk:.4f}" if risk is not None else "n/a"
        print(f"  - {pid}  {ptype}/{tf}  {status}  risk_r={rs}  {sid[:40]}")
    if len(to_purge) > 15:
        print(f"  ... and {len(to_purge) - 15} more")

    if args.dry_run:
        print("\nDRY-RUN only. Re-run with --apply to delete + rebuild pattern_statistics.")
        return 0

    if not to_purge:
        # Still rebuild stats to heal any counter drift
        print("\nNo low-risk rows to delete; rebuilding pattern_statistics anyway…")
        rebuilt = journal.rebuild_all_statistics()
        print("Rebuild:", rebuilt)
        return 0

    print(f"\nDeleting {len(to_purge)} instances…")
    deleted = 0
    for pid, *_rest in to_purge:
        if journal.purge_instance(pid):
            deleted += 1
        if deleted % 100 == 0 and deleted:
            print(f"  deleted {deleted}/{len(to_purge)}")
    print(f"  deleted {deleted}")

    print("Rebuilding pattern_statistics from remaining closed instances…")
    rebuilt = journal.rebuild_all_statistics()
    print("  rebuild:", rebuilt)

    with sf() as s:
        after = {
            "instances": s.execute(text("SELECT count(*) FROM pattern_instances")).scalar(),
            "events": s.execute(text("SELECT count(*) FROM pattern_events")).scalar(),
            "outcomes": s.execute(text("SELECT count(*) FROM pattern_outcomes")).scalar(),
            "stats_rows": s.execute(text("SELECT count(*) FROM pattern_statistics")).scalar(),
            "stats_sample_sum": s.execute(
                text("SELECT coalesce(sum(sample_size),0) FROM pattern_statistics")
            ).scalar(),
            "remaining_low_risk": s.execute(
                text(
                    """
                    SELECT count(*) FROM pattern_instances
                    WHERE pattern_type <> 'consolidation'
                      AND atr_at_detect > 0
                      AND abs(entry_price - stop_level) / atr_at_detect < :min_r
                    """
                ),
                {"min_r": min_r},
            ).scalar(),
        }
        closed = s.execute(
            text(
                """
                SELECT count(*) FROM pattern_instances
                WHERE status IN ('succeeded','failed','expired')
                """
            )
        ).scalar()

    print("\n=== AFTER ===")
    for k, v in after.items():
        print(f"  {k}: {v}")
    print(f"  closed_instances: {closed}")
    print(f"  stats_sample_sum vs closed: {after['stats_sample_sum']} vs {closed}")

    # Sanity: no measurable low-risk left; stats sample ≈ closed (startup_recovery still counted)
    ok = True
    if int(after["remaining_low_risk"] or 0) > 0:
        print("WARNING: remaining_low_risk > 0 (check invalid ATR / edge cases)")
        ok = False
    if int(after["stats_sample_sum"] or 0) > int(closed or 0):
        print("WARNING: stats_sample_sum exceeds closed instance count")
        ok = False
    if deleted != len(to_purge):
        print(f"WARNING: deleted {deleted} != candidates {len(to_purge)}")
        ok = False

    print("\nRESULT:", "OK" if ok else "CHECK WARNINGS")
    return 0 if ok else 3


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Backfill pattern_statistics planned R:R fields from closed pattern_instances.

Usage (from backend/):
  python scripts/backfill_planned_rails_stats.py
  python scripts/backfill_planned_rails_stats.py --url "postgresql+psycopg://..."

Requires DATABASE_URL / TIP_DATABASE_URL or --url. Applies pending migrations first.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill planned rails stats")
    parser.add_argument(
        "--url",
        default=os.environ.get("DATABASE_URL")
        or os.environ.get("TIP_DATABASE_URL")
        or "",
        help="SQLAlchemy database URL",
    )
    args = parser.parse_args()
    url = (args.url or "").strip()
    if not url:
        print(
            "ERROR: provide --url or DATABASE_URL / TIP_DATABASE_URL",
            file=sys.stderr,
        )
        return 1

    # backend/ is on path when run from backend/
    backend_root = Path(__file__).resolve().parents[1]
    if str(backend_root) not in sys.path:
        sys.path.insert(0, str(backend_root))

    from app.db.session import apply_flyway_sql, create_engine_and_session
    from app.journal.postgres_journal import PostgresPatternJournal

    mig_dir = backend_root / "db" / "migration"
    engine, sf = create_engine_and_session(url)
    apply_flyway_sql(engine, mig_dir)

    journal = PostgresPatternJournal(sf)
    result = journal.recompute_planned_rails_stats()
    print(
        "Backfill complete:",
        f"buckets_updated={result['buckets_updated']}",
        f"instances_included={result['instances_included']}",
        f"instances_skipped={result['instances_skipped']}",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

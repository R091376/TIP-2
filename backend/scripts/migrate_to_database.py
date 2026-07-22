#!/usr/bin/env python3
"""Apply Flyway-compatible SQL migrations (V1..Vn) to a target Postgres URL.

Usage:
  python scripts/migrate_to_database.py --url "postgresql+psycopg://user:pass@host:5432/db"
  # or set DATABASE_URL / TARGET_DATABASE_URL

Also verifies default users admin + test exist (creates via UserService if missing).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# backend/ on path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _normalize_url(url: str) -> str:
    url = url.strip()
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://") :]
    elif url.startswith("postgresql://") and "+psycopg" not in url:
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate TIP schema to a Postgres database")
    parser.add_argument(
        "--url",
        default=os.environ.get("TARGET_DATABASE_URL") or os.environ.get("DATABASE_URL") or "",
        help="SQLAlchemy/psycopg URL (postgresql+psycopg://...)",
    )
    parser.add_argument(
        "--skip-user-check",
        action="store_true",
        help="Only apply SQL migrations; do not ensure admin/test users",
    )
    args = parser.parse_args()
    if not args.url:
        print("ERROR: provide --url or TARGET_DATABASE_URL / DATABASE_URL", file=sys.stderr)
        return 2

    url = _normalize_url(args.url)
    # redact for logs
    redacted = url
    if "@" in url:
        redacted = url.split("@", 1)[0].rsplit(":", 1)[0] + ":***@" + url.split("@", 1)[1]
    print(f"Migrating to {redacted}")

    from app.config import Settings
    from app.db.session import apply_flyway_sql, create_engine_and_session
    from app.user.service import UserService

    mig_dir = ROOT / "db" / "migration"
    engine, session_factory = create_engine_and_session(url)
    apply_flyway_sql(engine, mig_dir)
    print("SQL migrations applied (V1.. latest).")

    if not args.skip_user_check:
        settings = Settings()
        # force passwords that match local tip DB
        object.__setattr__(settings, "tip_admin_password", os.environ.get("TIP_ADMIN_PASSWORD", "admin"))
        object.__setattr__(settings, "tip_test_password", os.environ.get("TIP_TEST_PASSWORD", "test"))
        us = UserService(settings, session_factory=session_factory)
        us.ensure_default_users()
        users = us.list_users()
        names = sorted(u.username for u in users)
        print(f"Users present: {names}")
        need = {"admin", "test"}
        have = {u.username.lower() for u in users}
        missing = need - have
        if missing:
            print(f"ERROR: missing default users: {sorted(missing)}", file=sys.stderr)
            return 1
        for u in users:
            if u.username.lower() in need:
                print(
                    f"  {u.username}: role={u.role.value} cash={u.cash_balance} "
                    f"active={u.active} trading={u.trading_enabled}"
                )
        print("Default users OK (admin + test).")

    print("DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Backfill Woodie daily levels and instance stamps.

Usage (from backend/):
  python -m scripts.backfill_woodie_sr
  python -m scripts.backfill_woodie_sr --force

--force overwrites freeze_source='backfill' rows only.
--force-live is reserved; live first_rth_tick rows stay insert-only unless
you delete them first:

  DELETE FROM daily_sr_levels WHERE method = 'woodie_open_v1';
  UPDATE pattern_instances SET
    sr_method=NULL, sr_session_date=NULL, sr_nearest=NULL, sr_near=NULL,
    sr_distance_atr=NULL, sr_cross=NULL, sr_confluence=NULL, sr_break=NULL,
    sr_open_through=NULL, sr_gap_dir=NULL, sr_ladder_json=NULL;
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--force-live", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    from app.config import Settings
    from app.container import build_container
    from app.sr.backfill import run_backfill

    container = build_container(Settings())
    stats = run_backfill(container, force=args.force, force_live=args.force_live)
    reload = getattr(container.pattern_journal, "reload_research_cache", None)
    if callable(reload):
        reload()
    print(stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

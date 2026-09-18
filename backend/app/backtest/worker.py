"""Slim worker: one run, no live feed, no uvicorn.

CLI:
  python -m app.backtest.worker --run-id <uuid>
  python -m app.backtest.worker --spec path.json
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from app.backtest.engine import execute_run, execute_spec
from app.backtest.jobs import InMemoryBacktestJobStore, PostgresBacktestJobStore
from app.backtest.spec import PatternSpec
from app.config import Settings
from app.market.ingest import CandleIngestService
from app.market.warehouse import InMemoryCandleWarehouse, PostgresCandleWarehouse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("tip2.backtest")


def build_worker_stack(settings: Settings | None = None):
    settings = settings or Settings()
    instruments = None
    try:
        from app.instrument.cache import InstrumentMasterCache

        instruments = InstrumentMasterCache(settings)
    except Exception:
        logger.exception("Instrument cache failed; CAS close will use key prefix only")

    warehouse: object
    jobs: object
    ingest: CandleIngestService | None
    if settings.watchlist_store == "memory" or settings.is_memory_profile:
        warehouse = InMemoryCandleWarehouse()
        jobs = InMemoryBacktestJobStore()
        ingest = None
        return settings, warehouse, jobs, ingest, instruments

    from app.db.session import apply_flyway_sql, create_engine_and_session
    from app.market.upstox_provider import UpstoxMarketDataProvider

    engine, sf = create_engine_and_session(settings.sqlalchemy_url)
    mig_dir = Path(__file__).resolve().parents[2] / "db" / "migration"
    apply_flyway_sql(engine, mig_dir)
    warehouse = PostgresCandleWarehouse(sf)
    jobs = PostgresBacktestJobStore(sf)
    provider = UpstoxMarketDataProvider(settings, None)
    ingest = CandleIngestService(settings, provider, warehouse)
    return settings, warehouse, jobs, ingest, instruments


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="TIP-2 pattern backtest worker")
    parser.add_argument("--run-id", dest="run_id", default=None)
    parser.add_argument("--spec", dest="spec_path", default=None)
    args = parser.parse_args(argv)
    settings, warehouse, jobs, ingest, instruments = build_worker_stack()
    if args.run_id:
        execute_run(args.run_id, jobs, settings, warehouse, ingest, instruments)
        row = jobs.get(args.run_id)
        print(json.dumps((row or {}).get("summary") or row, default=str, indent=2))
        return 0
    if args.spec_path:
        raw = json.loads(Path(args.spec_path).read_text(encoding="utf-8"))
        spec = PatternSpec.from_dict(raw)
        result = execute_spec(spec, settings, warehouse, ingest, instruments)
        print(json.dumps(result.summary, default=str, indent=2))
        return 0
    parser.error("provide --run-id or --spec")
    return 2


if __name__ == "__main__":
    sys.exit(main())

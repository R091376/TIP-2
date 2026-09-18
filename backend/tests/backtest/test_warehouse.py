from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.market.models import Candle
from app.market.warehouse import InMemoryCandleWarehouse, PostgresCandleWarehouse
from app.market.warehouse_entities import MarketCandleCoverageRow, MarketCandleRow


def _c(t, price=100.0):
    return Candle(t, price, price + 1, price - 1, price, 10)


def test_memory_upsert_load_and_no_refetch_coverage():
    wh = InMemoryCandleWarehouse()
    bars = [_c(1_700_000_000 + i * 300, 100 + i) for i in range(5)]
    n = wh.upsert_many("NSE_EQ|X", "5m", bars, source="historical")
    assert n == 5
    loaded = wh.load("NSE_EQ|X", "5m", 1_700_000_000, 1_700_000_000 + 4 * 300)
    assert len(loaded) == 5
    cov = wh.coverage("NSE_EQ|X", "5m")
    assert cov is not None
    assert cov[0] == 1_700_000_000
    # Second upsert of same bars is idempotent.
    wh.upsert_many("NSE_EQ|X", "5m", bars, source="backfill")
    assert len(wh.load("NSE_EQ|X", "5m", 1_700_000_000, 1_700_000_000 + 4 * 300)) == 5


def test_postgres_warehouse_sqlite_roundtrip():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    assert MarketCandleRow.__tablename__
    assert MarketCandleCoverageRow.__tablename__
    Base.metadata.create_all(engine)
    sf = sessionmaker(bind=engine, expire_on_commit=False)
    wh = PostgresCandleWarehouse(sf)
    bars = [_c(1_700_000_000 + i * 300) for i in range(3)]
    wh.upsert_many("NSE_EQ|TCS", "5m", bars, source="historical")
    loaded = wh.load("NSE_EQ|TCS", "5m", 1_700_000_000, 1_800_000_000)
    assert [c.time for c in loaded] == [b.time for b in bars]
    wh.shutdown()


def test_coverage_complete_rejects_missing_day_and_early_end():
    from zoneinfo import ZoneInfo

    from app.market.ingest import coverage_complete, session_start_epoch

    ist = ZoneInfo("Asia/Kolkata")
    d0 = date(2023, 11, 14)
    d1 = date(2023, 11, 15)
    open0 = int(datetime(2023, 11, 14, 9, 15, tzinfo=ist).timestamp())
    last5 = int(datetime(2023, 11, 15, 15, 25, tzinfo=ist).timestamp())
    last5_early = int(datetime(2023, 11, 15, 14, 0, tzinfo=ist).timestamp())
    next_open = int(datetime(2023, 11, 15, 9, 15, tzinfo=ist).timestamp())
    last1h = int(datetime(2023, 11, 15, 14, 15, tzinfo=ist).timestamp())

    assert coverage_complete((open0, last5), d0, d1, "5m", 930) is True
    assert coverage_complete((next_open, last5), d0, d1, "5m", 930) is False
    assert coverage_complete((open0, last5_early), d0, d1, "5m", 930) is False
    assert coverage_complete((open0, last1h), d0, d1, "1h", 930) is True
    assert coverage_complete(None, d0, d1, "5m", 930) is False
    assert coverage_complete(
        (session_start_epoch(d0), session_start_epoch(d1)), d0, d1, "1d"
    ) is True

from datetime import date, datetime

from app.market.candle_boundary import NSE_ZONE
from app.market.candle_engine import CandleEngine
from app.market.models import Candle
from app.sr.backfill import run_backfill
from app.sr.models import METHOD_WOODIE_OPEN_V1
from app.sr.service import DailySrService
from app.sr.store import InMemoryDailySrStore


class _WL:
    def find_all_active(self):
        return [type("E", (), {"symbol_id": "NSE_EQ|X"})()]


class _Journal:
    def iter_instances_for_sr_backfill(self, start, end):
        return []


class _C:
    def __init__(self):
        self.settings = type("S", (), {})()
        self.settings.research_stats_max_range_days = 180
        self.settings.pattern_sr_near_atr = 0.5
        self.settings.lookback_days_for = lambda tf: {"1m": 10, "5m": 60}.get(tf, 30)
        self.candle_engine = CandleEngine()
        store = InMemoryDailySrStore()
        self.daily_sr_service = DailySrService(type("S", (), {"pattern_sr_enabled": True})(), self.candle_engine, store)
        self.pattern_journal = _Journal()
        self.watchlist_repo = _WL()


def test_stamp_instances_uses_iter_instances_for_sr_backfill():
    """Postgres journal only exposes iter_instances_for_sr_backfill — do not require aliases."""
    from app.patterns.models import PatternDirection, PatternType, new_pattern
    from app.sr.backfill import _stamp_instances
    from app.sr.woodie import compute_woodie_open_v1

    lv = compute_woodie_open_v1(12, 10, 11, 11)
    store = InMemoryDailySrStore()
    store.insert_if_absent(
        "NSE_EQ|X",
        date(2026, 8, 17),
        lv,
        prev_candle_time=1,
        today_open_candle_time=2,
        freeze_source="backfill",
    )
    p = new_pattern(
        pattern_type=PatternType.HAMMER,
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        direction=PatternDirection.LONG,
        entry_price=11.0,
        stop_level=10.0,
        target_level=13.0,
        atr_at_detect=1.0,
        reference_level=11.0,
        lookback_high=12.0,
        detect_candle_time=int(datetime(2026, 8, 17, 10, 15, tzinfo=NSE_ZONE).timestamp()),
    )
    called = {"n": 0}

    class J:
        def iter_instances_for_sr_backfill(self, start, end):
            called["n"] += 1
            return [p]

        def update_sr_stamp(self, pattern):
            called["updated"] = pattern.sr_method

    stamped, skipped, _ = _stamp_instances(
        J(), store, CandleEngine(), type("S", (), {"pattern_sr_near_atr": 0.5})(),
        date(2026, 2, 20), date(2026, 8, 18),
    )
    assert called["n"] == 1
    assert stamped == 1
    assert skipped == 0
    assert p.sr_method == "woodie_open_v1"
    assert called.get("updated") == "woodie_open_v1"


def test_backfill_uses_that_days_1d_open():
    c = _C()
    fri = Candle(int(datetime(2026, 8, 14, 0, 0, tzinfo=NSE_ZONE).timestamp()), 10, 12, 10, 11, 1)
    mon = Candle(int(datetime(2026, 8, 17, 0, 0, tzinfo=NSE_ZONE).timestamp()), 13, 14, 12, 13.5, 1)
    c.candle_engine.seed("NSE_EQ|X", "1d", [fri, mon])
    run_backfill(c)
    lv = c.daily_sr_service._store.get("NSE_EQ|X", date(2026, 8, 17), METHOD_WOODIE_OPEN_V1)
    assert lv is not None
    assert lv.today_open == 13.0
    assert lv.prev_high == 12.0

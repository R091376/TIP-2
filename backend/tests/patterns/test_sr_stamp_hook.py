from datetime import datetime
from zoneinfo import ZoneInfo

from app.market.models import Candle
from app.patterns.evaluator import PatternEvaluator
from app.patterns.models import PatternDirection, PatternType, new_pattern
from app.sr.woodie import compute_woodie_open_v1

IST = ZoneInfo("Asia/Kolkata")


class _Settings:
    pattern_sr_enabled = True
    pattern_sr_stamp_enabled = True
    pattern_sr_near_atr = 0.5


class _Sr:
    def __init__(self, levels):
        self.levels = levels
        self.asked = None

    def ensure_levels(self, symbol_id, session_date):
        self.asked = (symbol_id, session_date)
        return self.levels


def test_stamp_hook_uses_detect_candle_date_not_clock():
    lv = compute_woodie_open_v1(12, 10, 11, 11)
    sr = _Sr(lv)
    ev = PatternEvaluator(
        _Settings(), None, None, None, None, None, daily_sr_service=sr
    )
    t = int(datetime(2026, 8, 17, 10, 15, tzinfo=IST).timestamp())
    closed = [Candle(t, 11.0, 11.2, 10.8, 11.1, 100)]
    p = new_pattern(
        pattern_type=PatternType.HAMMER,
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        direction=PatternDirection.LONG,
        entry_price=11.1,
        stop_level=10.0,
        target_level=13.0,
        atr_at_detect=1.0,
        reference_level=11.0,
        lookback_high=12.0,
        detect_candle_time=t,
    )
    ev._stamp_sr("NSE_EQ|X", "5m", closed, [p])
    assert sr.asked[1].isoformat() == "2026-08-17"
    assert p.sr_method == "woodie_open_v1"

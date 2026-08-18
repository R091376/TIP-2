from datetime import date

from app.market.models import Candle
from app.patterns.models import PatternDirection, PatternType, new_pattern
from app.sr.stamp import stamp_woodie_sr
from app.sr.woodie import compute_woodie_open_v1


def _pat(**kwargs):
    defaults = dict(
        pattern_type=PatternType.HAMMER,
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        direction=PatternDirection.LONG,
        entry_price=6.2,
        stop_level=5.0,
        target_level=8.0,
        atr_at_detect=1.0,
        reference_level=6.0,
        lookback_high=7.0,
    )
    defaults.update(kwargs)
    return new_pattern(**defaults)


def test_stamp_confluence_at_s2():
    lv = compute_woodie_open_v1(12, 10, 11, 6)
    p = _pat(entry_price=6.2)
    bar = Candle(1, 6.3, 6.4, 6.1, 6.2, 100)
    stamp_woodie_sr(p, bar, lv, session_date=date(2026, 8, 18), near_atr=0.5)
    assert p.sr_method == "woodie_open_v1"
    assert p.sr_nearest == "s2"
    assert p.sr_near is True
    assert p.sr_confluence is True
    assert p.sr_cross == "none"
    assert p.sr_break is False
    assert "s2_down" in (p.sr_open_through or "")
    assert p.sr_ladder_json is not None


def test_stamp_zero_atr_leaves_unstamped():
    lv = compute_woodie_open_v1(12, 10, 11, 11)
    p = _pat(atr_at_detect=0.0)
    stamp_woodie_sr(p, Candle(1, 11, 11.2, 10.9, 11.1, 1), lv, session_date=date(2026, 8, 18))
    assert p.sr_method is None


def test_stamp_nan_atr_leaves_unstamped():
    lv = compute_woodie_open_v1(12, 10, 11, 11)
    p = _pat(atr_at_detect=float("nan"))
    stamp_woodie_sr(p, Candle(1, 11, 11.2, 10.9, 11.1, 1), lv, session_date=date(2026, 8, 18))
    assert p.sr_method is None


def test_stamp_without_signal_leaves_cross_null():
    lv = compute_woodie_open_v1(12, 10, 11, 11)
    p = _pat(entry_price=11.0)
    stamp_woodie_sr(
        p, None, lv, session_date=date(2026, 8, 18), include_cross=False
    )
    assert p.sr_method == "woodie_open_v1"
    assert p.sr_cross is None
    assert p.sr_break is None
    assert p.sr_open_through is not None

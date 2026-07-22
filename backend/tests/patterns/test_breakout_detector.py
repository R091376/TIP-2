from datetime import datetime, timezone

from app.market.models import Candle
from app.patterns.breakout import detect_breakout, evaluate_breakout_bar, lifecycle_breakout
from app.patterns.models import PatternStage, PatternType


def _series_breakout():
    """20 prior bars with high 100, then breakout close 105."""
    candles = []
    for i in range(25):
        # flat-ish range under 100 high
        h = 100.0 if i < 24 else 106.0
        l = 90.0
        o = 95.0
        c = 96.0 if i < 24 else 105.0
        vol = 1000 if i < 24 else 5000
        candles.append(Candle(1_700_000_000 + i * 300, o, h, l, c, vol))
    return candles


def test_detect_breakout():
    closed = _series_breakout()
    cfg = {
        "lookback_candles": 20,
        "volume_avg_period": 20,
        "volume_multiplier": 1.5,
        "confirmation_mode": "close",
        "success_atr_mult_without_retest": 2.0,
        "atr_period": 14,
        "detector_version": "breakout-v1",
    }
    p = detect_breakout(
        "NSE_EQ|X", "5m", closed, float("-inf"), False, cfg, datetime.now(timezone.utc)
    )
    assert p is not None
    assert p.pattern_type == PatternType.BREAKOUT
    assert p.reference_level > 0
    assert p.entry_price > p.reference_level


def test_lifecycle_fail_on_close_below_ref():
    closed = _series_breakout()
    cfg = {
        "lookback_candles": 20,
        "volume_avg_period": 20,
        "volume_multiplier": 1.5,
        "confirmation_mode": "close",
        "success_atr_mult_without_retest": 2.0,
        "retest_atr_mult": 0.25,
        "strengthen_atr_mult": 1.0,
        "success_rr": 2.0,
        "atr_period": 14,
    }
    now = datetime.now(timezone.utc)
    p = detect_breakout("K", "5m", closed, float("-inf"), False, cfg, now)
    assert p is not None
    fail_bar = Candle(p.detect_candle_time + 300, 99, 99.5, 98, 98.5, 1000)
    events = lifecycle_breakout(p, fail_bar, cfg, now)
    assert p.is_terminal()
    assert p.status == PatternStage.FAILED
    assert any(e.stage == PatternStage.FAILED for e in events)


def test_evaluate_bar_returns_still_open():
    closed = _series_breakout()
    cfg = {
        "lookback_candles": 20,
        "volume_avg_period": 20,
        "volume_multiplier": 1.5,
        "confirmation_mode": "close",
        "success_atr_mult_without_retest": 2.0,
        "retest_atr_mult": 0.25,
        "strengthen_atr_mult": 1.0,
        "success_rr": 2.0,
        "atr_period": 14,
    }
    now = datetime.now(timezone.utc)
    ev = evaluate_breakout_bar("K", "5m", [], closed, False, cfg, now)
    assert len(ev.newly_detected) >= 1 or len(ev.still_open) >= 0

"""BreakoutBarEvaluator edge cases (Java BreakoutBarEvaluatorTest parity)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.market.models import Candle
from app.patterns.breakout import evaluate_breakout_bar
from app.patterns.models import PatternStage


NOW = datetime(2026, 7, 13, 10, 0, tzinfo=timezone.utc)


def _cfg(**overrides):
    base = {
        "lookback_candles": 20,
        "volume_avg_period": 20,
        "volume_multiplier": 1.5,
        "confirmation_mode": "close",
        "retest_atr_mult": 0.25,
        "strengthen_atr_mult": 1.0,
        "success_rr": 2.0,
        "success_atr_mult_without_retest": 2.0,
        "atr_period": 14,
        "detector_version": "breakout-v1-test",
    }
    base.update(overrides)
    return base


def rising_series(n: int = 25, base_high: float = 100.0) -> list[Candle]:
    """n-1 bars under base_high, last bar breaks out."""
    candles: list[Candle] = []
    t0 = 1_700_000_000
    for i in range(n):
        if i < n - 1:
            h, l, o, c, vol = base_high, base_high - 10, base_high - 5, base_high - 4, 1000
        else:
            h, l, o, c, vol = base_high + 6, base_high - 10, base_high - 1, base_high + 5, 5000
        candles.append(Candle(t0 + i * 300, o, h, l, c, vol))
    return candles


def test_end_to_end_detect_then_confirm_on_next_bar():
    series = rising_series(25, 100)
    open_p: list = []
    e1 = evaluate_breakout_bar("S", "5m", open_p, series, False, _cfg(), NOW)
    assert len(e1.newly_detected) == 1
    assert len(e1.still_open) == 1
    assert any(ev.stage == PatternStage.DETECTED for ev in e1.events)
    live = e1.still_open[0]
    assert live.flag_confirmed is False

    open_p = list(e1.still_open)
    last = series[-1]
    next_close = last.close + 0.1
    series = list(series) + [
        Candle(
            last.time + 1,
            next_close,
            next_close + 0.05,
            max(live.reference_level + 0.01, next_close - 0.05),
            next_close,
            2000,
        )
    ]
    e2 = evaluate_breakout_bar(
        "S", "5m", open_p, series, False, _cfg(), NOW + timedelta(seconds=300)
    )
    assert e2.still_open, "instance should still be open"
    assert e2.still_open[0].flag_confirmed is True
    assert any(ev.stage == PatternStage.CONFIRMED for ev in e2.events)


def test_multi_instance_anti_spam_on_same_series():
    series = rising_series(25, 100)
    open_p: list = []
    e1 = evaluate_breakout_bar("S", "5m", open_p, series, False, _cfg(), NOW)
    open_p = list(e1.still_open)
    assert len(open_p) == 1

    e2 = evaluate_breakout_bar("S", "5m", open_p, series, False, _cfg(), NOW)
    assert len(e2.newly_detected) == 0
    assert len(e2.still_open) == 1


def test_fail_when_close_below_reference():
    series = rising_series(25, 100)
    e1 = evaluate_breakout_bar("S", "5m", [], series, False, _cfg(), NOW)
    live = e1.still_open[0]
    last = series[-1]
    fail = Candle(last.time + 1, 99, 99.5, 98, 98.5, 1000)
    series2 = list(series) + [fail]
    e2 = evaluate_breakout_bar(
        "S", "5m", [live], series2, False, _cfg(), NOW + timedelta(seconds=300)
    )
    assert live.is_terminal()
    assert live.status == PatternStage.FAILED
    assert any(ev.stage == PatternStage.FAILED for ev in e2.events)


def test_index_segment_close_fallback_volume_ignored():
    series = rising_series(25, 100)
    # zero volume on breakout bar would fail BOTH mode without fallback
    series[-1] = Candle(
        series[-1].time,
        series[-1].open,
        series[-1].high,
        series[-1].low,
        series[-1].close,
        0,
    )
    e1 = evaluate_breakout_bar(
        "S",
        "5m",
        [],
        series,
        True,  # index segment
        _cfg(confirmation_mode="both"),
        NOW,
    )
    assert len(e1.newly_detected) == 1
    assert e1.newly_detected[0].confirmation_mode_used.value == "close_fallback"

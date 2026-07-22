"""BreakdownBarEvaluator edge cases (Java BreakdownBarEvaluatorTest parity)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.market.models import Candle
from app.patterns.breakdown import evaluate_breakdown_bar
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
        "detector_version": "breakdown-v1-test",
    }
    base.update(overrides)
    return base


def falling_series(n: int = 25, base_low: float = 120.0) -> list[Candle]:
    """n-1 bars above base_low, last bar breaks down."""
    candles: list[Candle] = []
    t0 = 1_700_000_000
    for i in range(n):
        if i < n - 1:
            h, l, o, c, vol = base_low + 10, base_low, base_low + 5, base_low + 4, 1000
        else:
            h, l, o, c, vol = base_low + 10, base_low - 6, base_low + 1, base_low - 5, 5000
        candles.append(Candle(t0 + i * 300, o, h, l, c, vol))
    return candles


def test_end_to_end_detect_then_confirm_on_next_bar():
    series = falling_series(25, 120)
    open_p: list = []
    e1 = evaluate_breakdown_bar("S", "5m", open_p, series, False, _cfg(), NOW)
    assert len(e1.newly_detected) == 1
    assert len(e1.still_open) == 1
    assert any(ev.stage == PatternStage.DETECTED for ev in e1.events)
    live = e1.still_open[0]
    assert live.flag_confirmed is False

    open_p = list(e1.still_open)
    last = series[-1]
    next_close = last.close - 0.1
    series = list(series) + [
        Candle(
            last.time + 1,
            next_close,
            min(live.reference_level - 0.01, next_close + 0.05),
            next_close - 0.05,
            next_close,
            2000,
        )
    ]
    e2 = evaluate_breakdown_bar(
        "S", "5m", open_p, series, False, _cfg(), NOW + timedelta(seconds=300)
    )
    assert e2.still_open, "instance should still be open"
    assert e2.still_open[0].flag_confirmed is True
    assert any(ev.stage == PatternStage.CONFIRMED for ev in e2.events)


def test_multi_instance_anti_spam_on_same_series():
    series = falling_series(25, 120)
    open_p: list = []
    e1 = evaluate_breakdown_bar("S", "5m", open_p, series, False, _cfg(), NOW)
    open_p = list(e1.still_open)
    assert len(open_p) == 1

    e2 = evaluate_breakdown_bar("S", "5m", open_p, series, False, _cfg(), NOW)
    assert len(e2.newly_detected) == 0
    assert len(e2.still_open) == 1


def test_fail_when_close_above_reference():
    series = falling_series(25, 120)
    e1 = evaluate_breakdown_bar("S", "5m", [], series, False, _cfg(), NOW)
    live = e1.still_open[0]
    last = series[-1]
    fail = Candle(last.time + 1, 121, 122, 120.5, 121.5, 1000)
    series2 = list(series) + [fail]
    e2 = evaluate_breakdown_bar(
        "S", "5m", [live], series2, False, _cfg(), NOW + timedelta(seconds=300)
    )
    assert live.is_terminal()
    assert live.status == PatternStage.FAILED
    assert any(ev.stage == PatternStage.FAILED for ev in e2.events)

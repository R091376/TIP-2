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


def test_retest_sets_flag_but_does_not_rewrite_target():
    series = rising_series(25, 100)
    e1 = evaluate_breakout_bar("S", "5m", [], series, False, _cfg(), NOW)
    live = e1.still_open[0]
    frozen = live.target_level
    last = series[-1]
    confirm_close = last.close + 0.1
    series = list(series) + [
        Candle(
            last.time + 1,
            confirm_close,
            confirm_close + 0.05,
            max(live.reference_level + 0.01, confirm_close - 0.05),
            confirm_close,
            2000,
        )
    ]
    e2 = evaluate_breakout_bar(
        "S", "5m", [live], series, False, _cfg(success_rr=1.0), NOW + timedelta(seconds=300)
    )
    assert e2.still_open[0].flag_confirmed is True
    ref = live.reference_level
    retest = Candle(series[-1].time + 1, ref + 0.2, ref + 0.4, ref - 0.5, ref + 0.1, 1500)
    series = list(series) + [retest]
    e3 = evaluate_breakout_bar(
        "S", "5m", [live], series, False, _cfg(success_rr=1.0), NOW + timedelta(seconds=600)
    )
    assert e3.still_open, "retest must not terminate the setup"
    assert live.flag_retested is True
    assert live.retest_floor == retest.low
    assert live.target_level == frozen


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


def test_detect_bar_does_not_retest_or_reclaim():
    series = rising_series(25, 100)
    e1 = evaluate_breakout_bar("S", "5m", [], series, False, _cfg(), NOW)
    live = e1.still_open[0]
    assert live.flag_retested is False
    assert live.flag_reclaimed is False
    assert any(ev.stage == PatternStage.DETECTED for ev in e1.events)
    assert not any(ev.stage == PatternStage.RETESTED for ev in e1.events)


def test_retest_and_reclaim_without_confirmation():
    series = rising_series(25, 100)
    det = series[-1]
    series[-1] = Candle(det.time, det.open, det.high, det.low, det.close, 1)
    e1 = evaluate_breakout_bar(
        "S", "5m", [], series, False, _cfg(confirmation_mode="both"), NOW
    )
    live = e1.still_open[0]
    assert live.flag_confirmed is False
    frozen_entry = live.entry_price
    ref = live.reference_level
    last = series[-1]
    retest = Candle(last.time + 1, ref + 0.2, ref + 0.3, ref - 0.4, ref, 1500)
    series = list(series) + [retest]
    e2 = evaluate_breakout_bar(
        "S", "5m", [live], series, False, _cfg(confirmation_mode="both"), NOW + timedelta(seconds=300)
    )
    assert live.flag_retested is True
    assert live.flag_reclaimed is False
    assert live.flag_confirmed is False
    assert live.entry_price == frozen_entry
    assert live.status == PatternStage.RETESTED
    assert any(ev.stage == PatternStage.RETESTED for ev in e2.events)

    reclaim = Candle(
        retest.time + 1,
        frozen_entry - 0.2,
        frozen_entry + 1.0,
        frozen_entry - 0.1,
        frozen_entry + 0.4,
        1600,
    )
    series = list(series) + [reclaim]
    e3 = evaluate_breakout_bar(
        "S", "5m", [live], series, False, _cfg(confirmation_mode="both"), NOW + timedelta(seconds=600)
    )
    assert live.flag_reclaimed is True
    assert live.flag_confirmed is False
    assert live.entry_price == frozen_entry
    assert live.status == PatternStage.RECLAIMED
    assert any(ev.stage == PatternStage.RECLAIMED for ev in e3.events)


def test_same_bar_bullish_retest_is_reclaim():
    series = rising_series(25, 100)
    e1 = evaluate_breakout_bar("S", "5m", [], series, False, _cfg(), NOW)
    live = e1.still_open[0]
    entry = live.entry_price
    ref = live.reference_level
    last = series[-1]
    bar = Candle(last.time + 1, ref + 0.2, entry + 1.0, ref - 0.3, entry + 0.4, 1500)
    assert bar.close > bar.open
    assert bar.close > entry
    series = list(series) + [bar]
    e2 = evaluate_breakout_bar(
        "S", "5m", [live], series, False, _cfg(), NOW + timedelta(seconds=300)
    )
    assert live.flag_retested is True
    assert live.flag_reclaimed is True
    assert live.entry_price == entry
    stages = [ev.stage for ev in e2.events]
    assert PatternStage.RETESTED in stages
    assert PatternStage.RECLAIMED in stages
    assert stages.index(PatternStage.RETESTED) < stages.index(PatternStage.RECLAIMED)


def test_same_bar_bearish_close_above_entry_is_retest_only():
    series = rising_series(25, 100)
    e1 = evaluate_breakout_bar("S", "5m", [], series, False, _cfg(), NOW)
    live = e1.still_open[0]
    entry = live.entry_price
    ref = live.reference_level
    last = series[-1]
    bar = Candle(last.time + 1, entry + 1.0, entry + 1.2, ref - 0.3, entry + 0.2, 1500)
    assert bar.close < bar.open
    assert bar.close > entry
    series = list(series) + [bar]
    evaluate_breakout_bar(
        "S", "5m", [live], series, False, _cfg(), NOW + timedelta(seconds=300)
    )
    assert live.flag_retested is True
    assert live.flag_reclaimed is False
    assert live.status == PatternStage.RETESTED


def test_continuation_without_retest_is_not_reclaim():
    series = rising_series(25, 100)
    e1 = evaluate_breakout_bar("S", "5m", [], series, False, _cfg(), NOW)
    live = e1.still_open[0]
    entry = live.entry_price
    band = live.reference_level + 0.25 * live.atr_at_detect
    last = series[-1]
    hold = Candle(last.time + 1, entry + 0.2, entry + 0.8, max(band + 0.05, entry - 0.05), entry + 0.5, 1500)
    series = list(series) + [hold]
    evaluate_breakout_bar(
        "S", "5m", [live], series, False, _cfg(), NOW + timedelta(seconds=300)
    )
    assert live.flag_retested is False
    assert live.flag_reclaimed is False


def test_target_bar_after_retest_still_sets_reclaim():
    series = rising_series(25, 100)
    e1 = evaluate_breakout_bar("S", "5m", [], series, False, _cfg(), NOW)
    live = e1.still_open[0]
    entry = live.entry_price
    ref = live.reference_level
    tgt = live.target_level
    last = series[-1]
    retest = Candle(last.time + 1, ref + 0.2, ref + 0.3, ref - 0.4, ref, 1500)
    series = list(series) + [retest]
    evaluate_breakout_bar(
        "S", "5m", [live], series, False, _cfg(), NOW + timedelta(seconds=300)
    )
    assert live.flag_retested is True
    assert live.flag_reclaimed is False
    win = Candle(retest.time + 1, entry - 0.2, tgt + 0.5, entry - 0.1, entry + 0.4, 1600)
    series = list(series) + [win]
    e3 = evaluate_breakout_bar(
        "S", "5m", [live], series, False, _cfg(), NOW + timedelta(seconds=600)
    )
    assert live.flag_reclaimed is True
    assert live.is_terminal()
    assert live.status == PatternStage.SUCCEEDED
    stages = [ev.stage for ev in e3.events]
    assert PatternStage.RECLAIMED in stages
    assert PatternStage.SUCCEEDED in stages

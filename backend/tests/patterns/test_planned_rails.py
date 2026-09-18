"""Unit tests for planned rails (risk/reward/R:R) metrics."""

from __future__ import annotations

from datetime import datetime, timezone

from app.patterns.models import PatternDirection, PatternStage, PatternStageEvent, PatternType, new_pattern
from app.patterns.planned_rails import (
    compute_planned_rails,
    passes_max_risk_r,
    passes_min_risk_r,
    planned_rails_from_pattern,
)


def test_long_breakout_planned_rr():
    # entry 101, stop 100, target 104, atr 2 → risk 1, reward 3 → RR 3; risk_r 0.5 reward_r 1.5
    m = compute_planned_rails(
        pattern_type="breakout",
        direction="long",
        entry=101.0,
        stop=100.0,
        target=104.0,
        atr=2.0,
    )
    assert m is not None
    assert m.risk_r == 0.5
    assert m.reward_r == 1.5
    assert m.planned_rr == 3.0


def test_short_planned_rr():
    m = compute_planned_rails(
        pattern_type="breakdown",
        direction="short",
        entry=100.0,
        stop=102.0,
        target=96.0,
        atr=2.0,
    )
    assert m is not None
    assert m.risk_r == 1.0
    assert m.reward_r == 2.0
    assert m.planned_rr == 2.0


def test_consolidation_excluded():
    assert (
        compute_planned_rails(
            pattern_type="consolidation",
            direction="long",
            entry=100.0,
            stop=99.0,
            target=101.0,
            atr=1.0,
        )
        is None
    )


def test_invalid_zero_risk():
    assert (
        compute_planned_rails(
            pattern_type="hammer",
            direction="long",
            entry=100.0,
            stop=100.0,
            target=103.0,
            atr=1.0,
        )
        is None
    )


def test_invalid_target_wrong_side():
    assert (
        compute_planned_rails(
            pattern_type="hammer",
            direction="long",
            entry=100.0,
            stop=99.0,
            target=98.0,
            atr=1.0,
        )
        is None
    )


def test_from_pattern_uses_final_rails():
    p = new_pattern(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="X",
        timeframe="5m",
        direction=PatternDirection.LONG,
        entry_price=101.0,
        stop_level=100.0,
        target_level=104.0,
        atr_at_detect=2.0,
    )
    m = planned_rails_from_pattern(p)
    assert m is not None
    assert m.planned_rr == 3.0


def test_median_planned_rr_helper():
    from app.patterns.planned_rails import median_planned_rr

    assert median_planned_rr([]) is None
    assert median_planned_rr([3.0]) == 3.0
    assert median_planned_rr([1.0, 20.0]) == 10.5
    assert median_planned_rr([1.0, 2.0, 100.0]) == 2.0


def test_passes_min_risk_r_threshold():
    # risk = 0.2 ATR → below 0.3
    tiny = new_pattern(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="X",
        timeframe="5m",
        direction=PatternDirection.LONG,
        entry_price=100.2,
        stop_level=100.0,
        target_level=103.0,
        atr_at_detect=1.0,
    )
    ok = new_pattern(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="X",
        timeframe="5m",
        direction=PatternDirection.LONG,
        entry_price=100.5,
        stop_level=100.0,
        target_level=103.0,
        atr_at_detect=1.0,
    )
    assert passes_min_risk_r(tiny, 0.3) is False
    assert passes_min_risk_r(ok, 0.3) is True
    assert passes_min_risk_r(tiny, 0.0) is True  # disabled
    # exact boundary: risk_r == 0.3 passes (>=)
    boundary = new_pattern(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="X",
        timeframe="5m",
        direction=PatternDirection.LONG,
        entry_price=100.3,
        stop_level=100.0,
        target_level=103.0,
        atr_at_detect=1.0,
    )
    assert passes_min_risk_r(boundary, 0.3) is True


def test_passes_max_risk_r_threshold():
    wide = new_pattern(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="X",
        timeframe="5m",
        direction=PatternDirection.LONG,
        entry_price=102.0,
        stop_level=100.0,
        target_level=106.0,
        atr_at_detect=1.0,
    )
    ok = new_pattern(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="X",
        timeframe="5m",
        direction=PatternDirection.LONG,
        entry_price=101.0,
        stop_level=100.0,
        target_level=104.0,
        atr_at_detect=1.0,
    )
    assert passes_max_risk_r(wide, 1.5) is False  # 2.0 ATR
    assert passes_max_risk_r(ok, 1.5) is True
    assert passes_max_risk_r(wide, None) is True
    assert passes_max_risk_r(wide, 0) is True


def test_passes_min_risk_consolidation_always():
    p = new_pattern(
        pattern_type=PatternType.CONSOLIDATION,
        symbol_id="X",
        timeframe="5m",
        direction=PatternDirection.LONG,
        entry_price=100.0,
        stop_level=100.0,
        target_level=100.0,
        atr_at_detect=1.0,
    )
    assert passes_min_risk_r(p, 0.3) is True


def test_evaluator_gate_min_risk_suppresses_detect():
    from app.config import Settings
    from app.patterns.evaluator import PatternEvaluator

    settings = Settings()
    object.__setattr__(settings, "pattern_min_risk_r", 0.3)
    ev = PatternEvaluator(settings, None, None, None, None, None)

    tiny = new_pattern(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="X",
        timeframe="5m",
        direction=PatternDirection.LONG,
        entry_price=100.1,
        stop_level=100.0,
        target_level=103.0,
        atr_at_detect=1.0,
    )
    good = new_pattern(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="Y",
        timeframe="5m",
        direction=PatternDirection.LONG,
        entry_price=100.5,
        stop_level=100.0,
        target_level=103.0,
        atr_at_detect=1.0,
    )
    now = datetime.now(timezone.utc)
    events = [
        PatternStageEvent(tiny.id, PatternStage.DETECTED, 1, 100.1, now),
        PatternStageEvent(good.id, PatternStage.DETECTED, 1, 100.5, now),
    ]
    advanced, newly, out_events, still = ev._gate_min_risk(
        [tiny], [tiny, good], events, [tiny, good]
    )
    assert [p.id for p in newly] == [good.id]
    assert all(p.id != tiny.id for p in advanced)
    assert all(p.id != tiny.id for p in still)
    assert all(e.pattern_id != tiny.id for e in out_events)
    assert len(out_events) == 1


def test_ratio_of_averages_not_mean_of_ratios():
    """Stats Plan R:R should be avg_reward_r / avg_risk_r, not mean(reward/risk).

    Trade A: risk_r=0.1, reward_r=2 → RR 20
    Trade B: risk_r=1.0, reward_r=1 → RR 1
    mean of RRs = 10.5; ratio of averages = 1.5 / 0.55 ≈ 2.727
    """
    a = compute_planned_rails(
        pattern_type="breakdown",
        direction="short",
        entry=100.0,
        stop=100.1,
        target=98.0,
        atr=1.0,
    )
    b = compute_planned_rails(
        pattern_type="breakdown",
        direction="short",
        entry=100.0,
        stop=101.0,
        target=99.0,
        atr=1.0,
    )
    assert a is not None and b is not None
    mean_of_rrs = (a.planned_rr + b.planned_rr) / 2
    avg_risk = (a.risk_r + b.risk_r) / 2
    avg_reward = (a.reward_r + b.reward_r) / 2
    ratio = avg_reward / avg_risk
    assert mean_of_rrs > 10
    assert abs(ratio - avg_reward / avg_risk) < 1e-9
    assert ratio < mean_of_rrs
    assert abs(ratio - (1.5 / 0.55)) < 1e-6

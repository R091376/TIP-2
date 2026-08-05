"""Unit tests for planned rails (risk/reward/R:R) metrics."""

from __future__ import annotations

from app.patterns.models import PatternDirection, PatternType, new_pattern
from app.patterns.planned_rails import compute_planned_rails, planned_rails_from_pattern


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

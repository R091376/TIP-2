import math

import pytest

from app.market.models import Candle
from app.sr.models import GAP_DOWN, GAP_FLAT, GAP_UP, METHOD_WOODIE_OPEN_V1
from app.sr.woodie import (
    WoodieInputError,
    atr_ok,
    compute_woodie_open_v1,
    gap_dir,
    nearest_level,
    open_through_tokens,
    signal_cross,
)


H, L, C = 12.0, 10.0, 11.0


def _lv(today_open: float):
    return compute_woodie_open_v1(H, L, C, today_open)


def test_canonical_flat_open():
    lv = _lv(11.0)
    assert lv.method == METHOD_WOODIE_OPEN_V1
    assert lv.range == 2.0
    assert lv.pp == 11.0
    assert lv.r1 == 12.0
    assert lv.s1 == 10.0
    assert lv.r2 == 13.0
    assert lv.s2 == 9.0
    assert lv.r3 == 14.0
    assert lv.s3 == 8.0
    assert lv.r4 == 16.0
    assert lv.s4 == 6.0
    assert lv.gap == 0.0
    assert gap_dir(lv.gap) == GAP_FLAT


def test_boundary_gap_up_open_13():
    lv = _lv(13.0)
    assert lv.pp == 12.0
    assert lv.r1 == 14.0
    assert lv.s1 == 12.0
    assert lv.r2 == 14.0
    assert lv.s2 == 10.0
    assert lv.r3 == 16.0
    assert lv.s3 == 10.0
    assert lv.gap == 2.0
    assert gap_dir(lv.gap) == GAP_UP


def test_large_gap_up_inverts_named_levels():
    lv = _lv(16.0)
    assert lv.pp == 13.5
    assert lv.r1 == 17.0
    assert lv.s1 == 15.0
    assert lv.r2 == 15.5
    assert lv.s2 == 11.5
    assert lv.r3 == 19.0
    assert lv.s3 == 13.0
    assert lv.s1 > lv.s2
    assert lv.r2 < lv.r1
    assert lv.gap == 5.0


def test_large_gap_down_inverts_and_open_through():
    lv = _lv(6.0)
    assert lv.pp == 8.5
    assert lv.r1 == 7.0
    assert lv.s1 == 5.0
    assert lv.r2 == 10.5
    assert lv.s2 == 6.5
    assert lv.r3 == 9.0
    assert lv.s3 == 3.0
    assert lv.s1 < lv.s2
    assert lv.r1 < lv.pp
    assert lv.r3 < lv.r2
    assert lv.gap == -5.0
    assert gap_dir(lv.gap) == GAP_DOWN
    tokens = open_through_tokens(6.0, lv)
    assert tokens == ["s2_down", "pp_down"]
    assert "s3_down" not in tokens
    assert "s1_down" not in tokens


def test_zero_range_collapses_to_pp():
    lv = compute_woodie_open_v1(10.0, 10.0, 10.0, 10.0)
    assert lv.range == 0.0
    assert lv.pp == lv.r1 == lv.s1 == lv.r2 == lv.s2 == lv.r3 == lv.s3 == 10.0
    assert nearest_level(10.0, lv) == "pp"


def test_rejects_non_finite_and_inverted_hl():
    with pytest.raises(WoodieInputError):
        compute_woodie_open_v1(float("nan"), 10.0, 11.0, 11.0)
    with pytest.raises(WoodieInputError):
        compute_woodie_open_v1(12.0, 10.0, 11.0, float("inf"))
    with pytest.raises(WoodieInputError):
        compute_woodie_open_v1(9.0, 10.0, 11.0, 11.0)


def test_atr_ok():
    assert atr_ok(0.5) is True
    assert atr_ok(0.0) is False
    assert atr_ok(-1.0) is False
    assert atr_ok(None) is False
    assert atr_ok(float("nan")) is False
    assert atr_ok(float("inf")) is False


def test_nearest_tie_prefers_pp_then_direction():
    lv = _lv(11.0)
    # midpoint between pp=11 and r1=12
    assert nearest_level(11.5, lv, direction="long") == "pp"
    assert nearest_level(11.5, lv, direction="short") == "pp"
    # closer to s1=10 than pp
    assert nearest_level(10.1, lv, direction="long") == "s1"
    assert nearest_level(11.9, lv, direction="short") == "r1"


def test_signal_cross_none_when_inside():
    lv = _lv(11.0)  # PP=11, R1=12
    bar = Candle(1, 11.3, 11.5, 11.2, 11.4, 100)
    assert signal_cross(bar, lv) == "none"


def test_signal_cross_two_sided_uses_candle_color():
    lv = _lv(11.0)  # S2=9, R1=12
    bull = Candle(1, 10.0, 12.5, 8.5, 10.5, 100)  # close > open
    bear = Candle(1, 11.0, 12.5, 8.5, 10.5, 100)  # close < open
    doji = Candle(1, 10.5, 12.5, 8.5, 10.5, 100)
    assert signal_cross(bull, lv).endswith("_up")
    assert signal_cross(bear, lv).endswith("_down")
    assert signal_cross(doji, lv) == "none"


def test_signal_cross_single_direction_farthest():
    lv = _lv(11.0)  # R1=12, R2=13, R3=14
    bar = Candle(1, 11.5, 14.2, 11.4, 14.1, 100)
    assert signal_cross(bar, lv) == "r3_up"


def test_gap_pct_none_when_prev_close_non_positive():
    lv = compute_woodie_open_v1(12.0, 10.0, 0.0, 11.0)
    assert lv.gap_pct is None
    assert math.isfinite(lv.gap)

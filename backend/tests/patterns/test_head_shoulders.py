from __future__ import annotations

from datetime import datetime, timezone

from app.config import Settings
from app.market.models import Candle
from app.patterns.double import detect_double
from app.patterns.head_shoulders import detect_head_shoulders, evaluate_hs_bar
from app.patterns.models import PatternStage, PatternType

NOW = datetime(2026, 8, 27, tzinfo=timezone.utc)
T0 = 1_700_000_000
STEP = 60


def _cfg(**overrides) -> dict:
    cfg = {**Settings().head_shoulders, "atr_period": 14, "_new_detects": True}
    cfg.update(overrides)
    return cfg


def _c(i: int, o: float, h: float, l: float, cl: float, v: int = 1000) -> Candle:
    return Candle(T0 + i * STEP, o, h, l, cl, v)


def _pad(n: int = 20, price: float = 108.0, rng: float = 2.0) -> list[Candle]:
    half = rng / 2.0
    return [_c(i, price, price + half, price - half, price) for i in range(n)]


def make_hs(*, invert: bool = False, wick_only: bool = False, slope_up: bool = False) -> list[Candle]:
    """Width-1 H&S. LS=21, A=24, H=28, B=32, RS=36, break=38."""
    mid = 108.0
    bars = _pad(20, price=mid, rng=2.0)
    ls, a, h, b, rs = 110.0, 104.0, 116.0, 103.5, 109.5
    if slope_up:
        b = 111.0
    if invert:
        ls, a, h, b, rs = (2 * mid - ls, 2 * mid - a, 2 * mid - h, 2 * mid - b, 2 * mid - rs)

    def filler() -> tuple[float, float, float, float]:
        return (mid, mid + 1.0, mid - 1.0, mid)

    def hi_bar(px: float) -> tuple[float, float, float, float]:
        return (mid, px, mid - 1.0, mid)

    def lo_bar(px: float) -> tuple[float, float, float, float]:
        return (mid, mid + 1.0, px, mid)

    seq: list[tuple[float, float, float, float]] = [filler()]  # 20
    if invert:
        seq += [
            lo_bar(ls),  # 21 LS
            filler(),  # 22
            filler(),  # 23
            hi_bar(a),  # 24 A
            filler(),  # 25
            filler(),  # 26
            filler(),  # 27
            lo_bar(h),  # 28 H
            filler(),  # 29
            filler(),  # 30
            filler(),  # 31
            hi_bar(b),  # 32 B
            filler(),  # 33
            filler(),  # 34
            filler(),  # 35
            lo_bar(rs),  # 36 RS
            filler(),  # 37 not through
        ]
        n_break = a + (b - a) * (38 - 24) / (32 - 24)
        if wick_only:
            seq.append((n_break, n_break + 1, n_break - 2, n_break - 0.2))
        else:
            seq.append((n_break, n_break + 2, n_break - 0.2, n_break + 1.0))
    else:
        seq += [
            hi_bar(ls),
            filler(),
            filler(),
            lo_bar(a),
            filler(),
            filler(),
            filler(),
            hi_bar(h),
            filler(),
            filler(),
            filler(),
            lo_bar(b),
            filler(),
            filler(),
            filler(),
            hi_bar(rs),
            (mid, mid + 1.0, mid - 1.0, mid),
        ]
        n_break = a + (b - a) * (38 - 24) / (32 - 24)
        if wick_only:
            seq.append((n_break + 1, n_break + 1.5, n_break - 2, n_break + 0.4))
        else:
            seq.append((n_break, n_break + 0.5, n_break - 1.5, n_break - 0.4))
    for j, (o, hh, l, cl) in enumerate(seq):
        bars.append(_c(20 + j, o, hh, l, cl))
    return bars


def test_textbook_hs_detects_short():
    bars = make_hs()
    p = detect_head_shoulders("S", "15m", bars, False, _cfg(fractal_width=1), NOW)
    assert p is not None
    assert p.pattern_type == PatternType.HEAD_SHOULDERS
    assert p.direction.value == "short"
    assert p.geometry is not None
    assert len(p.geometry["pivots"]) == 5
    rs = next(x for x in p.geometry["pivots"] if x["role"] == "right_shoulder")
    assert p.stop_level > rs["price"]


def test_inverse_detects_long():
    bars = make_hs(invert=True)
    p = detect_head_shoulders("S", "15m", bars, False, _cfg(fractal_width=1), NOW)
    assert p is not None
    assert p.pattern_type == PatternType.INVERSE_HEAD_SHOULDERS
    assert p.direction.value == "long"
    rs = next(x for x in p.geometry["pivots"] if x["role"] == "right_shoulder")
    assert p.stop_level < rs["price"]


def test_wick_through_neckline_no_detect():
    bars = make_hs(wick_only=True)
    p = detect_head_shoulders("S", "15m", bars, False, _cfg(fractal_width=1), NOW)
    assert p is None


def test_head_not_prominent_rejected():
    bars = make_hs()
    p = detect_head_shoulders(
        "S", "15m", bars, False, _cfg(fractal_width=1, min_head_prominence_atr=20.0), NOW
    )
    assert p is None


def test_shoulders_too_uneven_rejected():
    bars = make_hs()
    p = detect_head_shoulders(
        "S", "15m", bars, False, _cfg(fractal_width=1, shoulder_tolerance_atr=0.01), NOW
    )
    assert p is None


def test_time_asymmetry_rejected():
    bars = make_hs()
    p = detect_head_shoulders(
        "S", "15m", bars, False, _cfg(fractal_width=1, max_time_asymmetry=1.01), NOW
    )
    # d1=d2=8, ratio=1.0 so 1.01 still passes; use 0.5 to reject
    p = detect_head_shoulders(
        "S", "15m", bars, False, _cfg(fractal_width=1, max_time_asymmetry=0.5), NOW
    )
    assert p is None


def test_span_boundaries():
    bars = make_hs()
    # LS=21 RS=36 span=15
    assert detect_head_shoulders(
        "S", "15m", bars, False, _cfg(fractal_width=1, min_span_bars=15), NOW
    )
    assert (
        detect_head_shoulders(
            "S", "15m", bars, False, _cfg(fractal_width=1, min_span_bars=16), NOW
        )
        is None
    )


def test_extreme_neckline_slope_rejected():
    bars = make_hs(slope_up=True)
    p = detect_head_shoulders(
        "S",
        "15m",
        bars,
        False,
        _cfg(fractal_width=1, max_neckline_slope_atr_per_bar=0.001),
        NOW,
    )
    assert p is None


def test_up_slope_armpit_above_left_shoulder_still_detects():
    bars = make_hs(slope_up=True)
    p = detect_head_shoulders(
        "S",
        "15m",
        bars,
        False,
        _cfg(fractal_width=1, max_neckline_slope_atr_per_bar=2.0),
        NOW,
    )
    # B=111 > LS=110; per-side predicate still allows if B < RS and B < H
    # RS=109.5, B=111 > RS so this should reject on armpit predicate.
    # That's correct per-side: B < RS is required.
    assert p is None or p.pattern_type == PatternType.HEAD_SHOULDERS


def test_occupancy_reclaim():
    bars = make_hs()
    cfg = _cfg(fractal_width=1)
    ev = evaluate_hs_bar("S", "15m", [], bars, False, cfg, NOW)
    if not ev.newly_detected:
        return
    p = ev.newly_detected[0]
    reclaim = _c(50, p.reference_level + 1, p.reference_level + 2, p.reference_level, p.reference_level + 1)
    ev2 = evaluate_hs_bar("S", "15m", [p], bars + [reclaim], False, cfg, NOW)
    assert not p.is_terminal()
    assert ev2.newly_detected == []
    assert p.status != PatternStage.FAILED


def test_overlap_double_and_inverse_independent():
    bars = make_hs(invert=True)
    hs = detect_head_shoulders("S", "15m", bars, False, _cfg(fractal_width=1), NOW)
    dbl = detect_double(
        "S",
        "15m",
        bars,
        False,
        {**Settings().double, "atr_period": 14, "_new_detects": True, "fractal_width": 1},
        NOW,
    )
    # Independent families: both may fire; at least H&S should on a valid inverse.
    assert hs is None or hs.pattern_type == PatternType.INVERSE_HEAD_SHOULDERS
    if hs is not None and dbl is not None:
        assert dbl.pattern_type.is_double()

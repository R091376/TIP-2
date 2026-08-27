from __future__ import annotations

from datetime import datetime, timezone

from app.config import Settings
from app.indicators.atr import AtrIndicator
from app.market.models import Candle
from app.patterns.double import detect_double, evaluate_double_bar
from app.patterns.models import ConfirmationMode, PatternStage, PatternType

NOW = datetime(2026, 8, 27, tzinfo=timezone.utc)
T0 = 1_700_000_000
STEP = 60


def _cfg(**overrides) -> dict:
    cfg = {**Settings().double, "atr_period": 14, "_new_detects": True}
    cfg.update(overrides)
    cfg["fractal_width"] = int(cfg.get("fractal_width", 2))
    return cfg


def _c(i: int, o: float, h: float, l: float, cl: float, v: int = 1000) -> Candle:
    return Candle(T0 + i * STEP, o, h, l, cl, v)


def _pad(n: int = 20, price: float = 104.0, rng: float = 2.0) -> list[Candle]:
    half = rng / 2.0
    return [_c(i, price, price + half, price - half, price) for i in range(n)]


def make_w(
    *,
    l1: float = 100.0,
    peak: float = 108.0,
    l2: float = 100.4,
    break_close: float = 108.3,
    invert: bool = False,
    extra_after: int = 0,
    wick_break: bool = False,
) -> list[Candle]:
    """Width-1 W (or mirrored M). L1 at 21, peak at 25, L2 at 29, break at 31."""
    mid = 104.0
    bars = _pad(20, price=mid, rng=2.0)

    def ohlc(high: float, low: float, close: float) -> tuple[float, float, float, float]:
        hi = max(high, close, mid)
        lo = min(low, close, mid)
        return (mid, hi, lo, close)

    if invert:
        h1, trough, h2 = peak, l1, peak + (l2 - l1)
        br = 2 * mid - break_close
        seq = [
            ohlc(mid + 1, mid - 1, mid),  # 20
            ohlc(h1, mid - 1, h1 - 0.5),  # 21 H1
            ohlc(mid + 1, mid - 1, mid),  # 22
            ohlc(mid + 1.2, mid - 1, mid),  # 23
            ohlc(mid + 1.4, mid - 1, mid),  # 24
            ohlc(mid + 1, trough, trough + 0.4),  # 25 trough
            ohlc(mid + 1.4, mid - 1, mid),  # 26
            ohlc(mid + 1, mid - 1, mid),  # 27
            ohlc(mid + 1, mid - 1, mid),  # 28
            ohlc(h2, mid - 1, h2 - 0.4),  # 29 H2
            ohlc(mid + 1, trough + 0.8, trough + 1.0),  # 30 still above trough
        ]
        if wick_break:
            seq.append(ohlc(trough + 1.5, br, trough + 0.2))
        else:
            seq.append(ohlc(mid, min(br, trough) - 0.5, br))
    else:
        seq = [
            ohlc(mid + 1, mid - 1, mid),  # 20
            ohlc(mid - 1, l1, l1 + 0.8),  # 21 L1
            ohlc(mid + 1, mid - 1, mid),  # 22
            ohlc(mid + 1.2, mid - 1, mid),  # 23
            ohlc(mid + 1.5, mid - 1, mid),  # 24
            ohlc(peak, mid - 1, mid + 1),  # 25 peak
            ohlc(mid + 1.5, mid - 1, mid),  # 26
            ohlc(mid + 1, mid - 1, mid),  # 27
            ohlc(mid + 1, mid - 1, mid),  # 28
            ohlc(mid - 1, l2, l2 + 0.8),  # 29 L2
            ohlc(peak - 0.5, mid - 1, peak - 1.0),  # 30 no close through
        ]
        if wick_break:
            seq.append(ohlc(break_close + 1, mid - 1, peak - 0.2))
        else:
            seq.append(ohlc(max(break_close, peak) + 0.5, mid - 1, break_close))
    for j, (o, h, l, cl) in enumerate(seq):
        bars.append(_c(20 + j, o, h, l, cl))
    for k in range(extra_after):
        i = 20 + len(seq) + k
        if invert:
            bars.append(_c(i, peak + 1, peak + 2, peak + 0.5, peak + 1))
        else:
            bars.append(_c(i, peak + 0.5, peak + 1, peak - 0.5, peak + 0.5))
    return bars


def test_textbook_w_detects_double_bottom():
    bars = make_w()
    p = detect_double("NSE_EQ|T", "15m", bars, False, _cfg(fractal_width=1), NOW)
    assert p is not None
    assert p.pattern_type == PatternType.DOUBLE_BOTTOM
    assert p.geometry is not None
    assert len(p.geometry["pivots"]) == 3
    assert p.reference_level == 108.0
    assert p.stop_level < min(100.0, 100.4)
    assert p.target_level >= 108.0 + 8.0 - 1e-9
    atr = AtrIndicator.latest(bars, 14)
    assert atr is not None and atr > 0


def test_mirror_m_detects_double_top():
    bars = make_w(invert=True)
    p = detect_double("NSE_EQ|T", "15m", bars, False, _cfg(fractal_width=1), NOW)
    assert p is not None
    assert p.pattern_type == PatternType.DOUBLE_TOP
    assert p.direction.value == "short"


def test_trough_band_asymmetric():
    cfg = _cfg(fractal_width=1)

    def atr_of(l2: float) -> float:
        a = AtrIndicator.latest(make_w(l2=l2), 14)
        assert a is not None
        return a

    shallow = 100.0 + 0.34 * atr_of(100.4)
    p = detect_double("S", "15m", make_w(l2=shallow), False, cfg, NOW)
    assert p is not None
    deeper_ok = 100.0 - 0.24 * atr_of(100.0)
    p = detect_double("S", "15m", make_w(l2=deeper_ok), False, cfg, NOW)
    assert p is not None
    deeper_bad = 100.0 - 0.28 * atr_of(99.0)
    p = detect_double("S", "15m", make_w(l2=deeper_bad), False, cfg, NOW)
    assert p is None
    shallow_bad = 100.0 + 0.38 * atr_of(101.0)
    p = detect_double("S", "15m", make_w(l2=shallow_bad), False, cfg, NOW)
    assert p is None


def test_height_too_small_rejected():
    p = detect_double(
        "S",
        "15m",
        make_w(l1=107.5, peak=108.0, l2=107.5, break_close=108.2),
        False,
        _cfg(fractal_width=1, min_height_atr=1.0),
        NOW,
    )
    assert p is None


def test_consumed_geometry_no_redetect():
    bars = make_w(extra_after=3)
    cfg = _cfg(fractal_width=1)
    first = detect_double("S", "15m", bars[:32], False, cfg, NOW)
    assert first is not None
    later = detect_double("S", "15m", bars, False, cfg, NOW)
    assert later is None


def test_family_slot_blocks_second():
    bars = make_w()
    cfg = _cfg(fractal_width=1)
    ev = evaluate_double_bar("S", "15m", [], bars, False, cfg, NOW)
    assert len(ev.newly_detected) == 1
    open_p = ev.still_open
    ev2 = evaluate_double_bar("S", "15m", open_p, bars, False, cfg, NOW)
    assert ev2.newly_detected == []


def test_fail_through_stop():
    bars = make_w()
    cfg = _cfg(fractal_width=1)
    p = detect_double("S", "15m", bars, False, cfg, NOW)
    assert p is not None
    fail = _c(40, p.stop_level - 1, p.stop_level, p.stop_level - 2, p.stop_level - 1)
    from app.patterns.classical_lifecycle import on_candle_classical

    events = on_candle_classical(p, fail, cfg, NOW)
    assert p.status == PatternStage.FAILED
    assert any(e.stage == PatternStage.FAILED for e in events)


def test_succeed_measured_target_not_on_detect():
    bars = make_w()
    cfg = _cfg(fractal_width=1)
    p = detect_double("S", "15m", bars, False, cfg, NOW)
    assert p is not None
    from app.patterns.classical_lifecycle import on_candle_classical

    detect_bar = bars[-1]
    on_candle_classical(p, detect_bar, cfg, NOW)
    assert not p.is_terminal()
    win = _c(50, p.target_level, p.target_level + 1, p.entry_price, p.target_level)
    on_candle_classical(p, win, cfg, NOW)
    assert p.status == PatternStage.SUCCEEDED


def test_fail_wins_over_succeed():
    bars = make_w()
    cfg = _cfg(fractal_width=1)
    p = detect_double("S", "15m", bars, False, cfg, NOW)
    assert p is not None
    from app.patterns.classical_lifecycle import on_candle_classical

    both = _c(
        50,
        p.entry_price,
        p.target_level + 1,
        p.stop_level - 1,
        p.stop_level - 0.5,
    )
    on_candle_classical(p, both, cfg, NOW)
    assert p.status == PatternStage.FAILED


def test_retest_does_not_rewrite_target():
    bars = make_w()
    cfg = _cfg(fractal_width=1)
    p = detect_double("S", "15m", bars, False, cfg, NOW)
    assert p is not None
    target = p.target_level
    from app.patterns.classical_lifecycle import on_candle_classical

    confirm = _c(40, 109.0, 110.0, 108.5, 109.0)
    on_candle_classical(p, confirm, cfg, NOW)
    assert p.flag_confirmed
    retest = _c(41, 108.2, 108.5, 107.8, 108.1)
    on_candle_classical(p, retest, cfg, NOW)
    assert p.flag_retested
    assert p.target_level == target
    stretch = _c(42, 109.0, p.reference_level + p.atr_at_detect + 0.1, 108.5, 109.5)
    on_candle_classical(p, stretch, cfg, NOW)
    assert p.flag_strengthened


def test_occupancy_reclaim_no_second_detect():
    bars = make_w()
    cfg = _cfg(fractal_width=1)
    ev = evaluate_double_bar("S", "15m", [], bars, False, cfg, NOW)
    assert len(ev.newly_detected) == 1
    p = ev.newly_detected[0]
    reclaim = _c(40, 107.0, 107.5, 106.0, 107.0)
    ev2 = evaluate_double_bar("S", "15m", [p], bars + [reclaim], False, cfg, NOW)
    assert not p.is_terminal()
    assert ev2.newly_detected == []


def test_new_detects_false_still_advances():
    bars = make_w()
    cfg = _cfg(fractal_width=1)
    p = detect_double("S", "15m", bars, False, cfg, NOW)
    assert p is not None
    cfg2 = {**cfg, "_new_detects": False}
    confirm = _c(40, 109.0, 110.0, 108.5, 109.0)
    ev = evaluate_double_bar("S", "15m", [p], bars + [confirm], False, cfg2, NOW)
    assert ev.newly_detected == []
    assert p.flag_confirmed


def test_index_volume_fallback():
    bars = make_w()
    p = detect_double("S", "15m", bars, True, _cfg(fractal_width=1, confirmation_mode="both"), NOW)
    assert p is not None
    assert p.confirmation_mode_used == ConfirmationMode.CLOSE_FALLBACK


def test_enable_top_false_skips_m():
    bars = make_w(invert=True)
    p = detect_double("S", "15m", bars, False, _cfg(fractal_width=1, enable_top=False), NOW)
    assert p is None


def test_separation_boundaries():
    """Inclusive span L2.index - L1.index; fixture span is 8."""
    bars = make_w()
    assert detect_double("S", "15m", bars, False, _cfg(fractal_width=1, min_pivot_separation=8), NOW)
    assert (
        detect_double("S", "15m", bars, False, _cfg(fractal_width=1, min_pivot_separation=9), NOW)
        is None
    )
    assert detect_double("S", "15m", bars, False, _cfg(fractal_width=1, max_pivot_separation=8), NOW)
    assert (
        detect_double("S", "15m", bars, False, _cfg(fractal_width=1, max_pivot_separation=7), NOW)
        is None
    )

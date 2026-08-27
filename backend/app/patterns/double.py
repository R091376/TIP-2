from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.indicators.atr import AtrIndicator
from app.indicators.volume_sma import VolumeSmaIndicator
from app.market.models import Candle
from app.patterns.classical_lifecycle import on_candle_classical
from app.patterns.geometry import (
    first_close_through,
    measured_target,
    scan_confirmed_pivots,
    signed_bars,
    structural_stop,
    unsigned_price,
)
from app.patterns.models import (
    ActivePattern,
    BarEvaluation,
    ConfirmationMode,
    PatternDirection,
    PatternStage,
    PatternStageEvent,
    PatternType,
    new_pattern,
)
from app.patterns.structure import Pivot


@dataclass(frozen=True, slots=True)
class _WPair:
    l1: Pivot
    peak: Pivot
    l2: Pivot
    height: float


def _volume_state(
    closed: list[Candle], index_segment: bool, config: dict
) -> tuple[ConfirmationMode, bool]:
    signal = closed[-1]
    vol = VolumeSmaIndicator.prior_average(closed, int(config.get("volume_avg_period", 20)))
    avg = vol if vol is not None else 0.0
    volume_unusable = index_segment or avg <= 0 or signal.volume <= 0
    configured = ConfirmationMode(str(config.get("confirmation_mode", "close")).lower())
    if volume_unusable and configured in (ConfirmationMode.VOLUME, ConfirmationMode.BOTH):
        return ConfirmationMode.CLOSE_FALLBACK, False
    volume_ok = (not volume_unusable) and signal.volume >= float(
        config.get("volume_multiplier", 1.5)
    ) * avg
    return configured, volume_ok


def _pair_w(
    highs: list[Pivot],
    lows: list[Pivot],
    atr: float,
    config: dict,
) -> list[_WPair]:
    min_sep = int(config.get("min_pivot_separation", 5))
    max_sep = int(config.get("max_pivot_separation", 50))
    trough_tol = float(config.get("trough_tolerance_atr", 0.35))
    max_deeper = float(config.get("max_second_deeper_atr", 0.25))
    min_h = float(config.get("min_height_atr", 1.0))
    max_h = float(config.get("max_height_atr", 8.0))
    out: list[_WPair] = []
    for l2 in reversed(lows):
        best: _WPair | None = None
        for l1 in lows:
            if l1.index >= l2.index:
                continue
            sep = l2.index - l1.index
            if sep < min_sep or sep > max_sep:
                continue
            delta = (l2.price - l1.price) / atr
            if delta < -max_deeper or delta > trough_tol:
                continue
            intervening = [h for h in highs if l1.index < h.index < l2.index]
            if not intervening:
                continue
            peak = max(intervening, key=lambda h: h.price)
            if not (peak.price > max(l1.price, l2.price)):
                continue
            height = peak.price - min(l1.price, l2.price)
            if height < min_h * atr or height > max_h * atr:
                continue
            cand = _WPair(l1, peak, l2, height)
            if best is None or cand.height > best.height:
                best = cand
        if best is not None:
            out.append(best)
    return out


def _pivot_dto(role: str, p: Pivot, bars: list[Candle], sign: int) -> dict:
    return {
        "role": role,
        "index": p.index,
        "time": bars[p.index].time,
        "price": unsigned_price(p.price, sign),
        "high": p.high if sign >= 0 else not p.high,
    }


def detect_double_side(
    symbol_id: str,
    timeframe: str,
    closed: list[Candle],
    index_segment: bool,
    config: dict,
    now: datetime,
    sign: int,
) -> ActivePattern | None:
    if not closed:
        return None
    atr = AtrIndicator.latest(closed, int(config.get("atr_period", 14)))
    if atr is None or not (atr > 0):
        return None
    width = int(config.get("fractal_width", 2))
    lookback = int(config.get("lookback_candles", 80))
    signed = signed_bars(closed, sign)
    highs, lows = scan_confirmed_pivots(signed, width, lookback)
    last = len(closed) - 1
    chosen: _WPair | None = None
    for pair in _pair_w(highs, lows, atr, config):
        start = pair.l2.index + width
        hit = first_close_through(
            signed, start, last, lambda i, px=pair.peak.price: px, True
        )
        if hit == last:
            chosen = pair
            break
    if chosen is None:
        return None

    signal = closed[-1]
    line = unsigned_price(chosen.peak.price, sign)
    height = chosen.height
    long_side = sign >= 0
    entry = signal.close
    extreme = min(
        unsigned_price(chosen.l1.price, sign),
        unsigned_price(chosen.l2.price, sign),
    ) if long_side else max(
        unsigned_price(chosen.l1.price, sign),
        unsigned_price(chosen.l2.price, sign),
    )
    stop = structural_stop(
        long_side, entry, extreme, atr, float(config.get("stop_buffer_atr", 0.15))
    )
    mode = str(config.get("target_mode", "measured")).lower()
    frac = float(config.get("measured_move_frac", 1.0))
    success_mult = float(config.get("success_atr_mult", 1.5))
    if mode == "atr":
        from app.patterns.geometry import atr_target_only

        target = atr_target_only(long_side, entry, atr, success_mult)
    else:
        target = measured_target(long_side, line, height, frac, entry, atr, success_mult)
    if long_side and not (target > entry and stop < entry):
        return None
    if not long_side and not (target < entry and stop > entry):
        return None

    confirm_mode, volume_ok = _volume_state(closed, index_segment, config)
    kind = "double_bottom" if long_side else "double_top"
    if long_side:
        pivots = [
            _pivot_dto("trough1", chosen.l1, closed, sign),
            _pivot_dto("peak", chosen.peak, closed, sign),
            _pivot_dto("trough2", chosen.l2, closed, sign),
        ]
    else:
        pivots = [
            _pivot_dto("peak1", chosen.l1, closed, sign),
            _pivot_dto("trough", chosen.peak, closed, sign),
            _pivot_dto("peak2", chosen.l2, closed, sign),
        ]
    geometry = {
        "kind": kind,
        "version": 1,
        "pivots": pivots,
        "confirmation": {
            "style": "horizontal",
            "price": line,
            "leftTime": closed[chosen.peak.index].time,
            "rightTime": signal.time,
        },
        "patternHeight": height,
        "breakIndex": last,
        "breakTime": signal.time,
        "breakPrice": entry,
    }
    return new_pattern(
        pattern_type=PatternType.DOUBLE_BOTTOM if long_side else PatternType.DOUBLE_TOP,
        symbol_id=symbol_id,
        timeframe=timeframe,
        direction=PatternDirection.LONG if long_side else PatternDirection.SHORT,
        volume_ok_at_detect=volume_ok,
        confirmation_mode_used=confirm_mode,
        reference_level=line,
        lookback_high=line if long_side else unsigned_price(chosen.l1.price, sign),
        atr_at_detect=atr,
        volume_at_detect=signal.volume,
        entry_price=entry,
        stop_level=stop,
        target_level=target,
        detect_candle_time=signal.time,
        detected_at=now,
        mfe_price=signal.high,
        mae_price=signal.low,
        detector_version=str(config.get("detector_version", "double-v1")),
        geometry=geometry,
    )


def detect_double(
    symbol_id: str,
    timeframe: str,
    closed: list[Candle],
    index_segment: bool,
    config: dict,
    now: datetime,
) -> ActivePattern | None:
    if not config.get("_new_detects", True):
        return None
    bottom = (
        detect_double_side(symbol_id, timeframe, closed, index_segment, config, now, 1)
        if bool(config.get("enable_bottom", True))
        else None
    )
    top = (
        detect_double_side(symbol_id, timeframe, closed, index_segment, config, now, -1)
        if bool(config.get("enable_top", True))
        else None
    )
    if bottom is not None and top is not None:
        bh = float((bottom.geometry or {}).get("patternHeight") or 0)
        th = float((top.geometry or {}).get("patternHeight") or 0)
        if th > bh:
            return top
        return bottom
    return bottom or top


def evaluate_double_bar(
    symbol_id: str,
    timeframe: str,
    open_items: list[ActivePattern],
    closed: list[Candle],
    index_segment: bool,
    config: dict,
    now: datetime,
) -> BarEvaluation:
    out = BarEvaluation()
    if not closed:
        for p in open_items:
            out.track(p)
        return out
    signal = closed[-1]
    still: list[ActivePattern] = []
    for p in open_items:
        if not p.pattern_type.is_double() or p.is_terminal():
            continue
        events = on_candle_classical(p, signal, config, now)
        out.advanced.append(p)
        out.add_events(events)
        if not p.is_terminal():
            still.append(p)
        else:
            out.track(p)

    already = any(not p.is_terminal() for p in still)
    allow_new = bool(config.get("_new_detects", True)) and not already
    detected = (
        detect_double(symbol_id, timeframe, closed, index_segment, config, now)
        if allow_new
        else None
    )
    if detected is not None:
        out.newly_detected.append(detected)
        out.events.append(
            PatternStageEvent(
                detected.id, PatternStage.DETECTED, signal.time, signal.close, now
            )
        )
        same = on_candle_classical(detected, signal, config, now)
        out.add_events(same)
        if detected.is_terminal():
            out.track(detected)
        else:
            still.append(detected)
    for p in still:
        out.track(p)
    return out

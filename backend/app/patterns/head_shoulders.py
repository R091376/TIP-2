from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.indicators.atr import AtrIndicator
from app.indicators.volume_sma import VolumeSmaIndicator
from app.market.models import Candle
from app.patterns.classical_lifecycle import on_candle_classical
from app.patterns.geometry import (
    first_close_through,
    line_price_at,
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
class _HsPair:
    ls: Pivot
    a: Pivot
    head: Pivot
    b: Pivot
    rs: Pivot
    height: float
    neck_at_head: float


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


def _lowest_between(lows: list[Pivot], left: int, right: int) -> Pivot | None:
    interval = [p for p in lows if left < p.index < right]
    if not interval:
        return None
    return min(interval, key=lambda p: p.price)


def _pair_hs(
    highs: list[Pivot],
    lows: list[Pivot],
    atr: float,
    config: dict,
) -> list[_HsPair]:
    min_span = int(config.get("min_span_bars", 8))
    max_span = int(config.get("max_span_bars", 70))
    prominence = float(config.get("min_head_prominence_atr", 0.50))
    shoulder_tol = float(config.get("shoulder_tolerance_atr", 0.60))
    max_asym = float(config.get("max_time_asymmetry", 2.5))
    max_slope = float(config.get("max_neckline_slope_atr_per_bar", 0.20))
    allow_slope = bool(config.get("allow_sloping_neckline", True))
    out: list[_HsPair] = []
    for rs in highs:
        for head in highs:
            if head.index >= rs.index:
                continue
            for ls in highs:
                if ls.index >= head.index:
                    continue
                span = rs.index - ls.index
                if span < min_span or span > max_span:
                    continue
                d1 = head.index - ls.index
                d2 = rs.index - head.index
                if d1 < 1 or d2 < 1:
                    continue
                if max(d1, d2) / min(d1, d2) > max_asym:
                    continue
                if head.price <= ls.price or head.price <= rs.price:
                    continue
                if head.price - max(ls.price, rs.price) < prominence * atr:
                    continue
                if abs(ls.price - rs.price) > shoulder_tol * atr:
                    continue
                a = _lowest_between(lows, ls.index, head.index)
                b = _lowest_between(lows, head.index, rs.index)
                if a is None or b is None:
                    continue
                if not (
                    a.price < ls.price
                    and a.price < head.price
                    and b.price < rs.price
                    and b.price < head.price
                ):
                    continue
                if a.index == b.index:
                    continue
                if not allow_slope:
                    if abs(a.price - b.price) > 0.25 * atr:
                        continue
                slope = abs(b.price - a.price) / abs(b.index - a.index)
                if slope > max_slope * atr:
                    continue
                neck_at_head = line_price_at(a.index, a.price, b.index, b.price, head.index)
                if not allow_slope:
                    neck_at_head = (a.price + b.price) / 2.0
                height = head.price - neck_at_head
                if height <= 0:
                    continue
                out.append(_HsPair(ls, a, head, b, rs, height, neck_at_head))
    return out


def _pivot_dto(role: str, p: Pivot, bars: list[Candle], sign: int) -> dict:
    return {
        "role": role,
        "index": p.index,
        "time": bars[p.index].time,
        "price": unsigned_price(p.price, sign),
        "high": p.high if sign >= 0 else not p.high,
    }


def detect_hs_side(
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
    lookback = int(config.get("lookback_candles", 100))
    signed = signed_bars(closed, sign)
    highs, lows = scan_confirmed_pivots(signed, width, lookback)
    last = len(closed) - 1
    allow_slope = bool(config.get("allow_sloping_neckline", True))
    live: list[tuple[_HsPair, float]] = []
    for pair in _pair_hs(highs, lows, atr, config):
        start = pair.rs.index + width

        def price_at(i: int, p=pair) -> float:
            if not allow_slope:
                return (p.a.price + p.b.price) / 2.0
            return line_price_at(p.a.index, p.a.price, p.b.index, p.b.price, i)

        hit = first_close_through(signed, start, last, price_at, False)
        if hit == last:
            live.append((pair, price_at(last)))
    if not live:
        return None
    live.sort(key=lambda item: (-item[0].height, -item[0].rs.index))
    chosen, neck_signed = live[0]

    signal = closed[-1]
    regular = sign >= 0
    long_side = not regular
    neck = unsigned_price(neck_signed, sign)
    height = chosen.height
    entry = signal.close
    rs_mkt = unsigned_price(chosen.rs.price, sign)
    stop = structural_stop(
        long_side, entry, rs_mkt, atr, float(config.get("stop_buffer_atr", 0.15))
    )
    mode = str(config.get("target_mode", "measured")).lower()
    frac = float(config.get("measured_move_frac", 1.0))
    success_mult = float(config.get("success_atr_mult", 1.5))
    if mode == "atr":
        from app.patterns.geometry import atr_target_only

        target = atr_target_only(long_side, entry, atr, success_mult)
    else:
        target = measured_target(long_side, neck, height, frac, entry, atr, success_mult)
    if long_side and not (target > entry and stop < entry):
        return None
    if not long_side and not (target < entry and stop > entry):
        return None

    confirm_mode, volume_ok = _volume_state(closed, index_segment, config)
    a_px = unsigned_price(chosen.a.price, sign)
    b_px = unsigned_price(chosen.b.price, sign)
    slope_per_bar = (b_px - a_px) / (chosen.b.index - chosen.a.index)
    kind = "head_shoulders" if regular else "inverse_head_shoulders"
    style = "sloped" if allow_slope else "horizontal"
    geometry = {
        "kind": kind,
        "version": 1,
        "pivots": [
            _pivot_dto("left_shoulder", chosen.ls, closed, sign),
            _pivot_dto("left_armpit", chosen.a, closed, sign),
            _pivot_dto("head", chosen.head, closed, sign),
            _pivot_dto("right_armpit", chosen.b, closed, sign),
            _pivot_dto("right_shoulder", chosen.rs, closed, sign),
        ],
        "neckline": {
            "style": style,
            "p1Time": closed[chosen.a.index].time,
            "p1Price": a_px,
            "p2Time": closed[chosen.b.index].time,
            "p2Price": b_px,
            "priceAtBreak": neck,
            "slopePerBar": slope_per_bar,
        },
        "confirmation": {"style": style, "price": neck},
        "patternHeight": height,
        "breakIndex": last,
        "breakTime": signal.time,
        "breakPrice": entry,
    }
    lookback_high = max(
        unsigned_price(chosen.ls.price, sign),
        unsigned_price(chosen.head.price, sign),
        unsigned_price(chosen.rs.price, sign),
        a_px,
        b_px,
    )
    return new_pattern(
        pattern_type=PatternType.HEAD_SHOULDERS if regular else PatternType.INVERSE_HEAD_SHOULDERS,
        symbol_id=symbol_id,
        timeframe=timeframe,
        direction=PatternDirection.SHORT if regular else PatternDirection.LONG,
        volume_ok_at_detect=volume_ok,
        confirmation_mode_used=confirm_mode,
        reference_level=neck,
        lookback_high=lookback_high,
        atr_at_detect=atr,
        volume_at_detect=signal.volume,
        entry_price=entry,
        stop_level=stop,
        target_level=target,
        detect_candle_time=signal.time,
        detected_at=now,
        mfe_price=signal.high,
        mae_price=signal.low,
        detector_version=str(config.get("detector_version", "hs-v1")),
        geometry=geometry,
    )


def detect_head_shoulders(
    symbol_id: str,
    timeframe: str,
    closed: list[Candle],
    index_segment: bool,
    config: dict,
    now: datetime,
) -> ActivePattern | None:
    if not config.get("_new_detects", True):
        return None
    regular = (
        detect_hs_side(symbol_id, timeframe, closed, index_segment, config, now, 1)
        if bool(config.get("enable_regular", True))
        else None
    )
    inverse = (
        detect_hs_side(symbol_id, timeframe, closed, index_segment, config, now, -1)
        if bool(config.get("enable_inverse", True))
        else None
    )
    if regular is not None and inverse is not None:
        rh = float((regular.geometry or {}).get("patternHeight") or 0)
        ih = float((inverse.geometry or {}).get("patternHeight") or 0)
        if rh > ih:
            return regular
        return inverse
    return regular or inverse


def evaluate_hs_bar(
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
        if not p.pattern_type.is_head_shoulders() or p.is_terminal():
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
        detect_head_shoulders(symbol_id, timeframe, closed, index_segment, config, now)
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

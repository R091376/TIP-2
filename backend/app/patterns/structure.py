from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.indicators.atr import AtrIndicator
from app.market.models import Candle
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
from app.patterns.short_trade import on_candle_short_trade


@dataclass(frozen=True, slots=True)
class Pivot:
    index: int
    price: float
    high: bool


def confirmed_pivot_index(n: int, width: int) -> int | None:
    if width < 1 or n < 2 * width + 1:
        return None
    return n - 1 - width


def is_pivot_high(bars: list[Candle], i: int, width: int) -> bool:
    if i < width or i + width >= len(bars):
        return False
    h = bars[i].high
    for j in range(i - width, i + width + 1):
        if j == i:
            continue
        if not (h > bars[j].high):
            return False
    return True


def is_pivot_low(bars: list[Candle], i: int, width: int) -> bool:
    if i < width or i + width >= len(bars):
        return False
    l = bars[i].low
    for j in range(i - width, i + width + 1):
        if j == i:
            continue
        if not (l < bars[j].low):
            return False
    return True


def pivot_highs_before(bars: list[Candle], before_index: int, width: int) -> list[Pivot]:
    out: list[Pivot] = []
    last_confirmable = len(bars) - 1 - width
    for i in range(width, before_index):
        if i > last_confirmable:
            break
        if is_pivot_high(bars, i, width):
            out.append(Pivot(i, bars[i].high, True))
    return out


def pivot_lows_before(bars: list[Candle], before_index: int, width: int) -> list[Pivot]:
    out: list[Pivot] = []
    last_confirmable = len(bars) - 1 - width
    for i in range(width, before_index):
        if i > last_confirmable:
            break
        if is_pivot_low(bars, i, width):
            out.append(Pivot(i, bars[i].low, False))
    return out


def sanitize_stop(long_side: bool, entry: float, raw_stop: float, atr: float) -> float:
    buffer = atr if atr > 0 else max(abs(entry) * 1e-4, 1e-6)
    if long_side:
        stop = raw_stop
        if not (stop < entry):
            stop = entry - buffer
        if not (stop < entry):
            stop = entry - max(abs(entry) * 1e-4, 1e-6)
        return stop
    stop = raw_stop
    if not (stop > entry):
        stop = entry + buffer
    if not (stop > entry):
        stop = entry + max(abs(entry) * 1e-4, 1e-6)
    return stop


def detect_structure(
    symbol_id: str,
    timeframe: str,
    closed: list[Candle],
    already_open: bool,
    config: dict,
    now: datetime,
) -> ActivePattern | None:
    if already_open or not closed:
        return None
    width = int(config.get("fractal_width", 2))
    n = len(closed)
    i = confirmed_pivot_index(n, width)
    if i is None:
        return None
    atr = AtrIndicator.latest(closed, int(config.get("atr_period", 14)))
    if atr is None or not (atr > 0):
        return None
    signal = closed[-1]
    pivot = closed[i]
    hh = is_pivot_high(closed, i, width)
    ll = is_pivot_low(closed, i, width)
    if hh == ll:
        return None

    if hh:
        priors = pivot_highs_before(closed, i, width)
        if not priors:
            return None
        prev = priors[-1]
        if not (pivot.high > prev.price):
            return None
        lows = pivot_lows_before(closed, i, width)
        raw_stop = pivot.high - atr if not lows else lows[-1].price
        stop = sanitize_stop(True, signal.close, raw_stop, atr)
        entry = signal.close
        target = entry + float(config.get("success_atr_mult", 1.5)) * atr
        return new_pattern(
            pattern_type=PatternType.HIGHER_HIGH,
            symbol_id=symbol_id,
            timeframe=timeframe,
            direction=PatternDirection.LONG,
            confirmation_mode_used=ConfirmationMode.CLOSE,
            reference_level=stop,
            lookback_high=pivot.high,
            atr_at_detect=atr,
            volume_at_detect=signal.volume,
            entry_price=entry,
            stop_level=stop,
            target_level=target,
            detect_candle_time=signal.time,
            detected_at=now,
            mfe_price=signal.high,
            mae_price=signal.low,
            detector_version=str(config.get("detector_version", "structure-v1")),
        )

    priors = pivot_lows_before(closed, i, width)
    if not priors:
        return None
    prev = priors[-1]
    if not (pivot.low < prev.price):
        return None
    highs = pivot_highs_before(closed, i, width)
    raw_stop = pivot.low + atr if not highs else highs[-1].price
    stop = sanitize_stop(False, signal.close, raw_stop, atr)
    entry = signal.close
    target = entry - float(config.get("success_atr_mult", 1.5)) * atr
    return new_pattern(
        pattern_type=PatternType.LOWER_LOW,
        symbol_id=symbol_id,
        timeframe=timeframe,
        direction=PatternDirection.SHORT,
        confirmation_mode_used=ConfirmationMode.CLOSE,
        reference_level=stop,
        lookback_high=pivot.low,
        atr_at_detect=atr,
        volume_at_detect=signal.volume,
        entry_price=entry,
        stop_level=stop,
        target_level=target,
        detect_candle_time=signal.time,
        detected_at=now,
        mfe_price=signal.high,
        mae_price=signal.low,
        detector_version=str(config.get("detector_version", "structure-v1")),
    )


def evaluate_structure_bar(
    symbol_id: str,
    timeframe: str,
    open_items: list[ActivePattern],
    closed: list[Candle],
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
    max_after = int(config.get("max_candles_after_detect", 30))

    for open_p in open_items:
        if not open_p.pattern_type.is_structure() or open_p.is_terminal():
            continue
        events = on_candle_short_trade(
            open_p,
            signal,
            now,
            max_after,
            "max_candles",
            confirm_ok=lambda c, p=open_p: (
                c.close > p.entry_price
                if p.direction == PatternDirection.LONG
                else c.close < p.entry_price
            ),
        )
        out.advanced.append(open_p)
        out.add_events(events)
        if not open_p.is_terminal():
            still.append(open_p)
        else:
            out.track(open_p)

    already = any(not p.is_terminal() for p in still)
    detected = detect_structure(symbol_id, timeframe, closed, already, config, now)
    if detected is not None:
        out.newly_detected.append(detected)
        out.events.append(
            PatternStageEvent(
                detected.id, PatternStage.DETECTED, signal.time, signal.close, now
            )
        )
        same = on_candle_short_trade(
            detected, signal, now, max_after, "max_candles", confirm_ok=lambda c: False
        )
        out.add_events(same)
        if detected.is_terminal():
            out.track(detected)
        else:
            still.append(detected)

    for p in still:
        out.track(p)
    return out

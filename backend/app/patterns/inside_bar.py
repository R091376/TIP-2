from __future__ import annotations

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


def detect_inside_bar(
    symbol_id: str,
    timeframe: str,
    closed: list[Candle],
    already_open: bool,
    config: dict,
    now: datetime,
) -> ActivePattern | None:
    if already_open or closed is None or len(closed) < 3:
        return None
    atr = AtrIndicator.latest(closed, int(config.get("atr_period", 14)))
    if atr is None or not (atr > 0):
        return None

    n = len(closed)
    signal = closed[-1]
    max_lag = max(1, int(config.get("max_bars_after_inside", 5)))

    for lag in range(1, max_lag + 1):
        inside_idx = n - 1 - lag
        mother_idx = inside_idx - 1
        if mother_idx < 0:
            break
        mother = closed[mother_idx]
        inside = closed[inside_idx]
        mother_range = mother.high - mother.low
        if not (mother_range >= float(config.get("min_mother_range_atr_mult", 0.5)) * atr):
            continue
        if not (inside.high < mother.high and inside.low > mother.low):
            continue

        long_break = signal.close > mother.high
        short_break = signal.close < mother.low
        if long_break == short_break:
            continue

        if n >= 2:
            prev = closed[n - 2]
            if long_break and prev.close > mother.high:
                continue
            if short_break and prev.close < mother.low:
                continue

        entry = signal.close
        stop = mother.low if long_break else mother.high
        target = (
            entry + float(config.get("success_atr_mult", 1.5)) * atr
            if long_break
            else entry - float(config.get("success_atr_mult", 1.5)) * atr
        )
        confirm_level = mother.high if long_break else mother.low
        return new_pattern(
            pattern_type=PatternType.INSIDE_BAR,
            symbol_id=symbol_id,
            timeframe=timeframe,
            direction=PatternDirection.LONG if long_break else PatternDirection.SHORT,
            confirmation_mode_used=ConfirmationMode.CLOSE,
            reference_level=stop,
            lookback_high=confirm_level,
            atr_at_detect=atr,
            volume_at_detect=signal.volume,
            entry_price=entry,
            stop_level=stop,
            target_level=target,
            detect_candle_time=signal.time,
            detected_at=now,
            mfe_price=signal.high,
            mae_price=signal.low,
            detector_version=str(config.get("detector_version", "inside-bar-v1")),
        )
    return None


def evaluate_inside_bar(
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
    max_after = int(config.get("max_candles_after_detect", 20))

    for open_p in open_items:
        if open_p.pattern_type != PatternType.INSIDE_BAR or open_p.is_terminal():
            continue
        events = on_candle_short_trade(
            open_p,
            signal,
            now,
            max_after,
            "max_candles",
            confirm_ok=lambda c, p=open_p: (
                c.close > p.lookback_high
                if p.direction == PatternDirection.LONG
                else c.close < p.lookback_high
            ),
        )
        out.advanced.append(open_p)
        out.add_events(events)
        if not open_p.is_terminal():
            still.append(open_p)
        else:
            out.track(open_p)

    already = any(not p.is_terminal() for p in still)
    detected = detect_inside_bar(symbol_id, timeframe, closed, already, config, now)
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

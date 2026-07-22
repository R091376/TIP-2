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


def is_bullish_engulfing(prior: Candle, signal: Candle) -> bool:
    prior_bear = prior.close < prior.open
    signal_bull = signal.close > signal.open
    engulfs = signal.open <= prior.close and signal.close >= prior.open
    return prior_bear and signal_bull and engulfs


def is_bearish_engulfing(prior: Candle, signal: Candle) -> bool:
    prior_bull = prior.close > prior.open
    signal_bear = signal.close < signal.open
    engulfs = signal.open >= prior.close and signal.close <= prior.open
    return prior_bull and signal_bear and engulfs


def detect_engulfing(
    symbol_id: str,
    timeframe: str,
    closed: list[Candle],
    already_open: bool,
    config: dict,
    now: datetime,
) -> ActivePattern | None:
    if already_open or closed is None or len(closed) < 2:
        return None
    atr = AtrIndicator.latest(closed, int(config.get("atr_period", 14)))
    if atr is None or not (atr > 0):
        return None
    prior = closed[-2]
    signal = closed[-1]
    rng = signal.high - signal.low
    if not (rng >= float(config.get("min_range_atr_mult", 0.5)) * atr):
        return None

    bullish = is_bullish_engulfing(prior, signal)
    bearish = is_bearish_engulfing(prior, signal)
    if bullish == bearish:
        return None

    long_side = bullish
    entry = signal.close
    stop = min(signal.low, prior.low) if long_side else max(signal.high, prior.high)
    target = (
        entry + float(config.get("success_atr_mult", 1.5)) * atr
        if long_side
        else entry - float(config.get("success_atr_mult", 1.5)) * atr
    )
    confirm_extreme = signal.high if long_side else signal.low
    return new_pattern(
        pattern_type=PatternType.BULLISH_ENGULFING if long_side else PatternType.BEARISH_ENGULFING,
        symbol_id=symbol_id,
        timeframe=timeframe,
        direction=PatternDirection.LONG if long_side else PatternDirection.SHORT,
        confirmation_mode_used=ConfirmationMode.CLOSE,
        reference_level=stop,
        lookback_high=confirm_extreme,
        atr_at_detect=atr,
        volume_at_detect=signal.volume,
        entry_price=entry,
        stop_level=stop,
        target_level=target,
        detect_candle_time=signal.time,
        detected_at=now,
        mfe_price=signal.high,
        mae_price=signal.low,
        detector_version=str(config.get("detector_version", "engulfing-v1")),
    )


def evaluate_engulfing_bar(
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
        if not open_p.pattern_type.is_engulfing() or open_p.is_terminal():
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
    detected = detect_engulfing(symbol_id, timeframe, closed, already, config, now)
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

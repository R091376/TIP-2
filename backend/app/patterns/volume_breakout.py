from __future__ import annotations

from datetime import datetime

from app.indicators.atr import AtrIndicator
from app.indicators.volume_sma import VolumeSmaIndicator
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


def detect_volume_breakout(
    symbol_id: str,
    timeframe: str,
    closed: list[Candle],
    already_open: bool,
    index_segment: bool,
    config: dict,
    now: datetime,
) -> ActivePattern | None:
    if already_open or not closed or index_segment:
        return None
    atr = AtrIndicator.latest(closed, int(config.get("atr_period", 14)))
    vol = VolumeSmaIndicator.prior_average(closed, int(config.get("volume_avg_period", 20)))
    if atr is None or vol is None or not (atr > 0) or not (vol > 0):
        return None
    signal = closed[-1]
    if signal.volume <= 0:
        return None
    bar_range = signal.high - signal.low
    vol_ok = signal.volume >= float(config.get("volume_multiplier", 2.0)) * vol
    move_ok = bar_range >= float(config.get("min_range_atr_mult", 0.5)) * atr
    if not vol_ok or not move_ok:
        return None

    long_side = signal.close >= signal.open
    entry = signal.close
    stop = signal.low if long_side else signal.high
    target = (
        entry + float(config.get("success_atr_mult", 1.5)) * atr
        if long_side
        else entry - float(config.get("success_atr_mult", 1.5)) * atr
    )
    confirm_extreme = signal.high if long_side else signal.low
    return new_pattern(
        pattern_type=PatternType.VOLUME_BREAKOUT,
        symbol_id=symbol_id,
        timeframe=timeframe,
        direction=PatternDirection.LONG if long_side else PatternDirection.SHORT,
        volume_ok_at_detect=True,
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
        detector_version=str(config.get("detector_version", "volume-breakout-v1")),
    )


def evaluate_volume_breakout_bar(
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
    max_after = int(config.get("max_candles_after_detect", 20))

    for open_p in open_items:
        if open_p.pattern_type != PatternType.VOLUME_BREAKOUT or open_p.is_terminal():
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
    detected = detect_volume_breakout(
        symbol_id, timeframe, closed, already, index_segment, config, now
    )
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

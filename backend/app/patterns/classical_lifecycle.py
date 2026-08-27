from __future__ import annotations

from datetime import datetime

from app.market.models import Candle
from app.patterns.lifecycle_support import expire, stage_event
from app.patterns.models import (
    ActivePattern,
    ConfirmationMode,
    FinalOutcome,
    PatternDirection,
    PatternStage,
    PatternStageEvent,
)


def _can_confirm_classical(instance: ActivePattern, candle: Candle) -> bool:
    long_side = instance.direction == PatternDirection.LONG
    still_through = (
        candle.close > instance.reference_level
        if long_side
        else candle.close < instance.reference_level
    )
    if not still_through:
        return False
    detect_bar = candle.time == instance.detect_candle_time
    mode = instance.confirmation_mode_used
    if mode == ConfirmationMode.VOLUME:
        return instance.volume_ok_at_detect and detect_bar
    if mode in (ConfirmationMode.CLOSE, ConfirmationMode.CLOSE_FALLBACK):
        return not detect_bar
    if mode == ConfirmationMode.BOTH:
        return instance.volume_ok_at_detect and not detect_bar
    return False


def on_candle_classical(
    instance: ActivePattern,
    candle: Candle,
    config: dict,
    now: datetime,
) -> list[PatternStageEvent]:
    if instance.is_terminal():
        return []

    events: list[PatternStageEvent] = []
    long_side = instance.direction == PatternDirection.LONG
    atr = instance.atr_at_detect
    ref = instance.reference_level

    instance.mfe_price = max(instance.mfe_price, candle.high)
    instance.mae_price = min(instance.mae_price, candle.low)
    if candle.time != instance.detect_candle_time:
        instance.duration_candles += 1

    failed = candle.close < instance.stop_level if long_side else candle.close > instance.stop_level
    if failed:
        instance.mark_terminal(
            FinalOutcome.FAILED, PatternStage.FAILED, "invalidation", candle.close
        )
        events.append(stage_event(instance, PatternStage.FAILED, candle, now))
        return events

    if candle.time != instance.detect_candle_time:
        hit = (
            candle.high >= instance.target_level
            if long_side
            else candle.low <= instance.target_level
        )
        if hit:
            instance.mark_terminal(
                FinalOutcome.SUCCEEDED, PatternStage.SUCCEEDED, "price_target", candle.close
            )
            events.append(stage_event(instance, PatternStage.SUCCEEDED, candle, now))
            return events

    if not instance.flag_confirmed and _can_confirm_classical(instance, candle):
        instance.flag_confirmed = True
        instance.confirmed_at = now
        events.append(stage_event(instance, PatternStage.CONFIRMED, candle, now))

    retest_mult = float(config.get("retest_atr_mult", 0.25))
    if instance.flag_confirmed and not instance.flag_retested:
        if long_side:
            in_zone = candle.low <= ref + retest_mult * atr and candle.close >= ref
        else:
            in_zone = candle.high >= ref - retest_mult * atr and candle.close <= ref
        if in_zone:
            instance.flag_retested = True
            instance.retest_floor = candle.low if long_side else candle.high
            events.append(stage_event(instance, PatternStage.RETESTED, candle, now))

    strengthen_mult = float(config.get("strengthen_atr_mult", 1.0))
    if instance.flag_confirmed and not instance.flag_strengthened:
        if long_side:
            extended = candle.high >= ref + strengthen_mult * atr
        else:
            extended = candle.low <= ref - strengthen_mult * atr
        if extended:
            instance.flag_strengthened = True
            events.append(stage_event(instance, PatternStage.STRENGTHENED, candle, now))

    max_candles = int(config.get("max_candles_after_detect", 40))
    if instance.duration_candles >= max_candles:
        return expire(instance, candle, "max_candles", now, False)

    instance.refresh_display_status()
    return events

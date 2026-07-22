from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from app.market.models import Candle
from app.patterns.lifecycle_support import expire, stage_event
from app.patterns.models import (
    ActivePattern,
    FinalOutcome,
    PatternDirection,
    PatternStage,
    PatternStageEvent,
)


def on_candle_short_trade(
    instance: ActivePattern,
    candle: Candle,
    now: datetime,
    max_candles_after_detect: int,
    expire_reason: str,
    confirm_ok: Callable[[Candle], bool] | None,
) -> list[PatternStageEvent]:
    """Detected → Confirmed → Succeeded | Failed (+ soft expire)."""
    if instance.is_terminal():
        return []

    events: list[PatternStageEvent] = []
    long_side = instance.direction == PatternDirection.LONG

    instance.mfe_price = max(instance.mfe_price, candle.high)
    instance.mae_price = min(instance.mae_price, candle.low)
    if candle.time != instance.detect_candle_time:
        instance.duration_candles += 1

    # Failed first
    if long_side:
        if candle.close < instance.stop_level:
            instance.mark_terminal(
                FinalOutcome.FAILED, PatternStage.FAILED, "invalidation", candle.close
            )
            events.append(stage_event(instance, PatternStage.FAILED, candle, now))
            return events
    elif candle.close > instance.stop_level:
        instance.mark_terminal(
            FinalOutcome.FAILED, PatternStage.FAILED, "invalidation", candle.close
        )
        events.append(stage_event(instance, PatternStage.FAILED, candle, now))
        return events

    # Succeeded (not on detect bar)
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

    # Confirmed
    if (
        not instance.flag_confirmed
        and candle.time != instance.detect_candle_time
        and confirm_ok is not None
        and confirm_ok(candle)
    ):
        instance.flag_confirmed = True
        instance.confirmed_at = now
        events.append(stage_event(instance, PatternStage.CONFIRMED, candle, now))

    if instance.duration_candles >= max_candles_after_detect:
        return expire(instance, candle, expire_reason, now, False)

    instance.refresh_display_status()
    return events

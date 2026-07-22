from __future__ import annotations

from datetime import datetime

from app.market.models import Candle
from app.patterns.models import (
    ActivePattern,
    FinalOutcome,
    PatternStage,
    PatternStageEvent,
)


def expire(
    instance: ActivePattern,
    last_candle: Candle | None,
    reason: str,
    now: datetime,
    null_excursions: bool = False,
) -> list[PatternStageEvent]:
    if instance.is_terminal():
        return []
    end = last_candle.close if last_candle is not None else None
    if null_excursions:
        instance.mark_terminal(FinalOutcome.EXPIRED, PatternStage.EXPIRED, reason, None, True)
    else:
        instance.mark_terminal(FinalOutcome.EXPIRED, PatternStage.EXPIRED, reason, end, False)
    candle_time = last_candle.time if last_candle is not None else instance.detect_candle_time
    price = end if end is not None else instance.entry_price
    return [
        PatternStageEvent(instance.id, PatternStage.EXPIRED, candle_time, price, now)
    ]


def stage_event(
    instance: ActivePattern, stage: PatternStage, candle: Candle, now: datetime
) -> PatternStageEvent:
    return PatternStageEvent(instance.id, stage, candle.time, candle.close, now)

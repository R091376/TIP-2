from __future__ import annotations

from datetime import datetime

from app.market.models import Candle
from app.patterns.models import (
    ActivePattern,
    FinalOutcome,
    PatternDirection,
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


def apply_retest_reclaim(
    instance: ActivePattern,
    candle: Candle,
    config: dict,
    now: datetime,
    events: list[PatternStageEvent],
) -> None:
    """Retest / reclaim after the detect bar. Independent of confirmation.

    Long: retest when low is in the ATR band; reclaim when close > detect entry.
    Short: retest when high is in the ATR band; reclaim when close < detect entry.
    Same-bar: reclaim only if the candle is in trade direction (bullish long /
    bearish short). A countertrend same-bar is retest only.
    Does not rewrite entry, stop, or target.
    """
    if candle.time == instance.detect_candle_time:
        return
    atr = instance.atr_at_detect
    ref = instance.reference_level
    entry = instance.entry_price
    mult = float(config.get("retest_atr_mult", 0.25))
    long_side = instance.direction == PatternDirection.LONG
    if long_side:
        in_retest = candle.low <= ref + mult * atr
        close_reclaim = candle.close > entry
        trade_dir = candle.close > candle.open
        retest_extreme = candle.low
    else:
        in_retest = candle.high >= ref - mult * atr
        close_reclaim = candle.close < entry
        trade_dir = candle.close < candle.open
        retest_extreme = candle.high

    same_bar_retest = False
    if not instance.flag_retested and in_retest:
        instance.flag_retested = True
        instance.retest_floor = retest_extreme
        events.append(stage_event(instance, PatternStage.RETESTED, candle, now))
        same_bar_retest = True

    if instance.flag_reclaimed or not instance.flag_retested or not close_reclaim:
        return
    if same_bar_retest and not trade_dir:
        return
    instance.flag_reclaimed = True
    events.append(stage_event(instance, PatternStage.RECLAIMED, candle, now))

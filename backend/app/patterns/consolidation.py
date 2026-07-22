from __future__ import annotations

from datetime import datetime

from app.indicators.atr import AtrIndicator
from app.market.models import Candle
from app.patterns.lifecycle_support import stage_event
from app.patterns.models import (
    ActivePattern,
    BarEvaluation,
    ConfirmationMode,
    FinalOutcome,
    PatternDirection,
    PatternStage,
    PatternStageEvent,
    PatternType,
    new_pattern,
)


def detect_consolidation(
    symbol_id: str,
    timeframe: str,
    closed: list[Candle],
    already_open: bool,
    config: dict,
    now: datetime,
) -> ActivePattern | None:
    if already_open or not closed:
        return None
    m = int(config.get("window_candles", 10))
    if len(closed) < m:
        return None
    atr = AtrIndicator.latest(closed, int(config.get("atr_period", 14)))
    if atr is None or not (atr > 0):
        return None

    n = len(closed)
    range_high = max(closed[i].high for i in range(n - m, n))
    range_low = min(closed[i].low for i in range(n - m, n))
    rng = range_high - range_low
    if not (rng <= float(config.get("range_atr_mult", 1.5)) * atr) or not (rng > 0):
        return None

    if n > m:
        prev_high = max(closed[i].high for i in range(n - 1 - m, n - 1))
        prev_low = min(closed[i].low for i in range(n - 1 - m, n - 1))
        prev_range = prev_high - prev_low
        if prev_range <= float(config.get("range_atr_mult", 1.5)) * atr:
            return None

    signal = closed[-1]
    mid = (range_high + range_low) / 2.0
    return new_pattern(
        pattern_type=PatternType.CONSOLIDATION,
        symbol_id=symbol_id,
        timeframe=timeframe,
        direction=PatternDirection.LONG,
        confirmation_mode_used=ConfirmationMode.CLOSE,
        reference_level=range_low,
        lookback_high=range_high,
        atr_at_detect=atr,
        volume_at_detect=signal.volume,
        entry_price=mid,
        stop_level=range_low,
        target_level=range_high,
        detect_candle_time=signal.time,
        detected_at=now,
        mfe_price=signal.high,
        mae_price=signal.low,
        detector_version=str(config.get("detector_version", "consolidation-v1")),
    )


def lifecycle_consolidation(
    instance: ActivePattern,
    candle: Candle,
    closed: list[Candle],
    config: dict,
    now: datetime,
) -> list[PatternStageEvent]:
    if instance.is_terminal():
        return []
    if instance.pattern_type != PatternType.CONSOLIDATION:
        raise ValueError("Consolidation only")

    events: list[PatternStageEvent] = []
    range_high = instance.lookback_high
    range_low = instance.reference_level
    detect_range = range_high - range_low

    instance.mfe_price = max(instance.mfe_price, candle.high)
    instance.mae_price = min(instance.mae_price, candle.low)
    if candle.time != instance.detect_candle_time:
        instance.duration_candles += 1

    if candle.close > range_high or candle.close < range_low:
        side = "expand_up" if candle.close > range_high else "expand_down"
        instance.mark_terminal(
            FinalOutcome.SUCCEEDED, PatternStage.SUCCEEDED, side, candle.close
        )
        events.append(stage_event(instance, PatternStage.SUCCEEDED, candle, now))
        return events

    max_dur = int(config.get("max_duration_candles", 30))
    if instance.duration_candles >= max_dur:
        instance.mark_terminal(
            FinalOutcome.FAILED, PatternStage.FAILED, "max_duration", candle.close
        )
        events.append(stage_event(instance, PatternStage.FAILED, candle, now))
        return events

    if (
        not instance.flag_strengthened
        and candle.high <= range_high
        and candle.low >= range_low
    ):
        window = int(config.get("window_candles", 10))
        min_stretch = max(window * 3 // 2, window + 1)
        long_enough = instance.duration_candles >= min_stretch
        tighter = False
        rolling = _rolling_range(closed, window)
        if rolling is not None and detect_range > 0:
            tighter = (
                rolling <= float(config.get("tighten_ratio", 0.85)) * detect_range
                and rolling > 0
            )
        if long_enough or tighter:
            instance.flag_strengthened = True
            events.append(stage_event(instance, PatternStage.STRENGTHENED, candle, now))

    instance.refresh_display_status()
    return events


def evaluate_consolidation_bar(
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
    for open_p in open_items:
        if open_p.pattern_type != PatternType.CONSOLIDATION or open_p.is_terminal():
            continue
        events = lifecycle_consolidation(open_p, signal, closed, config, now)
        out.advanced.append(open_p)
        out.add_events(events)
        if not open_p.is_terminal():
            still.append(open_p)
        else:
            out.track(open_p)

    already = any(not p.is_terminal() for p in still)
    detected = detect_consolidation(symbol_id, timeframe, closed, already, config, now)
    if detected is not None:
        out.newly_detected.append(detected)
        out.events.append(
            PatternStageEvent(
                detected.id, PatternStage.DETECTED, signal.time, signal.close, now
            )
        )
        same = lifecycle_consolidation(detected, signal, closed, config, now)
        out.add_events(same)
        if detected.is_terminal():
            out.track(detected)
        else:
            still.append(detected)

    for p in still:
        out.track(p)
    return out


def _rolling_range(closed: list[Candle], window: int) -> float | None:
    if not closed or window < 1 or len(closed) < window:
        return None
    n = len(closed)
    hi = max(closed[i].high for i in range(n - window, n))
    lo = min(closed[i].low for i in range(n - window, n))
    return hi - lo

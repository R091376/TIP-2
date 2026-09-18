from __future__ import annotations

from datetime import datetime
from math import inf

from app.indicators.atr import AtrIndicator
from app.indicators.donchian import DonchianIndicator
from app.indicators.volume_sma import VolumeSmaIndicator
from app.market.models import Candle
from app.patterns.lifecycle_support import apply_retest_reclaim, stage_event
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


def detect_breakdown(
    symbol_id: str,
    timeframe: str,
    closed: list[Candle],
    min_open_reference: float,
    index_segment: bool,
    config: dict,
    now: datetime,
) -> ActivePattern | None:
    if not closed:
        return None
    atr = AtrIndicator.latest(closed, int(config.get("atr_period", 14)))
    don = DonchianIndicator.prior_lowest_low(closed, int(config.get("lookback_candles", 20)))
    vol = VolumeSmaIndicator.prior_average(closed, int(config.get("volume_avg_period", 20)))
    if atr is None or don is None:
        return None
    avg_volume = vol if vol is not None else 0.0

    signal = closed[-1]
    ref = don
    if not (signal.close < ref):
        return None
    if not (ref < min_open_reference):
        return None

    volume_unusable = index_segment or avg_volume <= 0 or signal.volume <= 0
    configured = ConfirmationMode(str(config.get("confirmation_mode", "both")).lower())
    if volume_unusable and configured in (ConfirmationMode.VOLUME, ConfirmationMode.BOTH):
        effective = ConfirmationMode.CLOSE_FALLBACK
        volume_ok = False
    else:
        effective = configured
        volume_ok = signal.volume >= float(config.get("volume_multiplier", 1.5)) * avg_volume

    target = ref - float(config.get("success_atr_mult_without_retest", 2.0)) * atr
    return new_pattern(
        pattern_type=PatternType.BREAKDOWN,
        symbol_id=symbol_id,
        timeframe=timeframe,
        direction=PatternDirection.SHORT,
        volume_ok_at_detect=volume_ok,
        confirmation_mode_used=effective,
        reference_level=ref,
        lookback_high=ref,
        atr_at_detect=atr,
        volume_at_detect=signal.volume,
        entry_price=signal.close,
        stop_level=ref,
        target_level=target,
        detect_candle_time=signal.time,
        detected_at=now,
        mfe_price=signal.high,
        mae_price=signal.low,
        detector_version=str(config.get("detector_version", "breakdown-v1")),
    )


def lifecycle_breakdown(
    instance: ActivePattern, candle: Candle, config: dict, now: datetime
) -> list[PatternStageEvent]:
    """Mirror of breakout for short direction."""
    if instance.is_terminal():
        return []
    if instance.pattern_type != PatternType.BREAKDOWN:
        raise ValueError("BreakdownLifecycle only handles BREAKDOWN")

    events: list[PatternStageEvent] = []
    atr = instance.atr_at_detect
    ref = instance.reference_level

    instance.mfe_price = max(instance.mfe_price, candle.high)
    instance.mae_price = min(instance.mae_price, candle.low)
    if candle.time != instance.detect_candle_time:
        instance.duration_candles += 1

    if candle.close > ref:
        instance.mark_terminal(
            FinalOutcome.FAILED, PatternStage.FAILED, "invalidation", candle.close
        )
        events.append(stage_event(instance, PatternStage.FAILED, candle, now))
        return events

    apply_retest_reclaim(instance, candle, config, now, events)

    if candle.low <= instance.target_level:
        instance.mark_terminal(
            FinalOutcome.SUCCEEDED, PatternStage.SUCCEEDED, "price_target", candle.close
        )
        events.append(stage_event(instance, PatternStage.SUCCEEDED, candle, now))
        return events

    if not instance.flag_confirmed and _can_confirm(instance, candle):
        instance.flag_confirmed = True
        instance.confirmed_at = now
        events.append(stage_event(instance, PatternStage.CONFIRMED, candle, now))

    if instance.flag_confirmed and not instance.flag_strengthened:
        if candle.low <= ref - float(config.get("strengthen_atr_mult", 1.0)) * atr:
            instance.flag_strengthened = True
            events.append(stage_event(instance, PatternStage.STRENGTHENED, candle, now))

    instance.refresh_display_status()
    return events


def evaluate_breakdown_bar(
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
    for open_p in open_items:
        if open_p.pattern_type != PatternType.BREAKDOWN or open_p.is_terminal():
            continue
        events = lifecycle_breakdown(open_p, signal, config, now)
        out.advanced.append(open_p)
        out.add_events(events)
        if not open_p.is_terminal():
            still.append(open_p)
        else:
            out.track(open_p)

    min_ref = min((p.reference_level for p in still), default=inf)
    detected = detect_breakdown(
        symbol_id, timeframe, closed, min_ref, index_segment, config, now
    )
    if detected is not None:
        out.newly_detected.append(detected)
        out.events.append(
            PatternStageEvent(
                detected.id, PatternStage.DETECTED, signal.time, signal.close, now
            )
        )
        same = lifecycle_breakdown(detected, signal, config, now)
        out.add_events(same)
        if detected.is_terminal():
            out.track(detected)
        else:
            still.append(detected)

    for p in still:
        out.track(p)
    return out


def _can_confirm(instance: ActivePattern, candle: Candle) -> bool:
    mode = instance.confirmation_mode_used
    still_below = candle.close < instance.reference_level
    if not still_below:
        return False
    detect_bar = candle.time == instance.detect_candle_time
    if mode == ConfirmationMode.VOLUME:
        return instance.volume_ok_at_detect and detect_bar
    if mode in (ConfirmationMode.CLOSE, ConfirmationMode.CLOSE_FALLBACK):
        return not detect_bar
    if mode == ConfirmationMode.BOTH:
        return instance.volume_ok_at_detect and not detect_bar
    return False

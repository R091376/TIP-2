from __future__ import annotations

from datetime import datetime
from enum import Enum

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


class PinKind(str, Enum):
    HAMMER = "hammer"
    SHOOTING_STAR = "shooting_star"


def pinbar_metrics(c: Candle) -> tuple[float, float, float, float, float]:
    body = abs(c.close - c.open)
    rng = c.high - c.low
    upper = c.high - max(c.open, c.close)
    lower = min(c.open, c.close) - c.low
    mid = (c.open + c.close) / 2.0
    return body, rng, upper, lower, mid


def classify_pinbar(signal: Candle, atr: float, config: dict) -> PinKind | None:
    if signal is None or not (atr > 0):
        return None
    body, rng, upper, lower, _ = pinbar_metrics(signal)
    if not (rng >= float(config.get("min_range_atr_mult", 0.5)) * atr):
        return None
    if not (rng > 0):
        return None

    max_body = float(config.get("max_body_range_ratio", 0.35))
    shadow_mult = float(config.get("shadow_body_mult", 2.0))
    max_opp = float(config.get("max_opposite_wick_range_ratio", 0.25))

    small_body = body <= max_body * rng
    doji_pin = body <= 1e-12 or (body / rng <= 0.05)

    if _is_hammer(lower, upper, body, rng, shadow_mult, max_opp, small_body, doji_pin):
        return PinKind.HAMMER
    if _is_star(upper, lower, body, rng, shadow_mult, max_opp, small_body, doji_pin):
        return PinKind.SHOOTING_STAR
    return None


def pinbar_geometry(
    bar: Candle,
    shadow_body_mult: float = 2.0,
    max_body_range_ratio: float = 0.35,
    max_opposite_wick_range_ratio: float = 0.25,
) -> str | None:
    """Simple geometry without ATR (tests)."""
    cfg = {
        "min_range_atr_mult": 0.0,
        "max_body_range_ratio": max_body_range_ratio,
        "shadow_body_mult": shadow_body_mult,
        "max_opposite_wick_range_ratio": max_opposite_wick_range_ratio,
    }
    body, rng, upper, lower, _ = pinbar_metrics(bar)
    if rng <= 0:
        return None
    atr = rng  # pass range gate
    kind = classify_pinbar(bar, atr, {**cfg, "min_range_atr_mult": 0.0})
    if kind == PinKind.HAMMER:
        return "hammer"
    if kind == PinKind.SHOOTING_STAR:
        return "shooting_star"
    return None


def _is_hammer(lower, upper, body, rng, shadow_mult, max_opp, small_body, doji_pin) -> bool:
    if not (
        lower >= shadow_mult * max(body, 1e-12) or (doji_pin and lower >= 0.6 * rng)
    ):
        return False
    if not (upper <= max_opp * rng):
        return False
    return small_body or doji_pin


def _is_star(upper, lower, body, rng, shadow_mult, max_opp, small_body, doji_pin) -> bool:
    if not (
        upper >= shadow_mult * max(body, 1e-12) or (doji_pin and upper >= 0.6 * rng)
    ):
        return False
    if not (lower <= max_opp * rng):
        return False
    return small_body or doji_pin


def trend_context_ok(closed: list[Candle], kind: PinKind, config: dict) -> bool:
    n = len(closed)
    lookback = max(2, int(config.get("trend_lookback", 10)))
    if n < lookback + 1:
        if n < 4:
            return True
        prev = closed[n - 2]
        older = closed[n - 4]
        return prev.close < older.close if kind == PinKind.HAMMER else prev.close > older.close
    total = sum(closed[i].close for i in range(n - 1 - lookback, n - 1))
    sma = total / lookback
    prev_close = closed[n - 2].close
    if kind == PinKind.HAMMER:
        return prev_close < sma
    return prev_close > sma


def detect_pinbar(
    symbol_id: str,
    timeframe: str,
    closed: list[Candle],
    already_open: bool,
    config: dict,
    now: datetime,
) -> ActivePattern | None:
    if already_open or not closed:
        return None
    atr = AtrIndicator.latest(closed, int(config.get("atr_period", 14)))
    if atr is None or not (atr > 0):
        return None
    signal = closed[-1]
    kind = classify_pinbar(signal, atr, config)
    if kind is None:
        return None
    if config.get("require_trend_context", True) and not trend_context_ok(closed, kind, config):
        return None

    hammer = kind == PinKind.HAMMER
    entry = signal.close
    stop = signal.low if hammer else signal.high
    target = (
        entry + float(config.get("success_atr_mult", 1.5)) * atr
        if hammer
        else entry - float(config.get("success_atr_mult", 1.5)) * atr
    )
    lookback_pair = signal.high if hammer else signal.low
    return new_pattern(
        pattern_type=PatternType.HAMMER if hammer else PatternType.SHOOTING_STAR,
        symbol_id=symbol_id,
        timeframe=timeframe,
        direction=PatternDirection.LONG if hammer else PatternDirection.SHORT,
        confirmation_mode_used=ConfirmationMode.CLOSE,
        reference_level=stop,
        lookback_high=lookback_pair,
        atr_at_detect=atr,
        volume_at_detect=signal.volume,
        entry_price=entry,
        stop_level=stop,
        target_level=target,
        detect_candle_time=signal.time,
        detected_at=now,
        mfe_price=signal.high,
        mae_price=signal.low,
        detector_version=str(config.get("detector_version", "pinbar-v1")),
    )


def evaluate_pinbar_bar(
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
        if not open_p.pattern_type.is_pin_bar() or open_p.is_terminal():
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
    detected = detect_pinbar(symbol_id, timeframe, closed, already, config, now)
    if detected is not None:
        out.newly_detected.append(detected)
        out.events.append(
            PatternStageEvent(
                detected.id, PatternStage.DETECTED, signal.time, signal.close, now
            )
        )
        same = on_candle_short_trade(
            detected,
            signal,
            now,
            max_after,
            "max_candles",
            confirm_ok=lambda c: False,  # not on detect bar
        )
        out.add_events(same)
        if detected.is_terminal():
            out.track(detected)
        else:
            still.append(detected)

    for p in still:
        out.track(p)
    return out

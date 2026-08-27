from __future__ import annotations

from collections.abc import Callable

from app.market.models import Candle
from app.patterns.structure import (
    Pivot,
    pivot_highs_before,
    pivot_lows_before,
    sanitize_stop,
)


def signed_candle(c: Candle, sign: int) -> Candle:
    if sign >= 0:
        return c
    return Candle(
        time=c.time,
        open=-c.open,
        high=-c.low,
        low=-c.high,
        close=-c.close,
        volume=c.volume,
    )


def signed_bars(bars: list[Candle], sign: int) -> list[Candle]:
    if sign >= 0:
        return bars
    return [signed_candle(c, sign) for c in bars]


def unsigned_price(price: float, sign: int) -> float:
    return price if sign >= 0 else -price


def scan_confirmed_pivots(
    closed: list[Candle], width: int, lookback: int
) -> tuple[list[Pivot], list[Pivot]]:
    if width < 1 or not closed:
        return [], []
    last = len(closed) - 1 - width
    if last < width:
        return [], []
    start = max(width, len(closed) - lookback) if lookback > 0 else width
    highs = [p for p in pivot_highs_before(closed, len(closed), width) if p.index >= start]
    lows = [p for p in pivot_lows_before(closed, len(closed), width) if p.index >= start]
    return highs, lows


def line_price_at(i1: int, p1: float, i2: int, p2: float, at: int) -> float:
    if i2 == i1:
        return p1
    return p1 + (p2 - p1) * (at - i1) / (i2 - i1)


def first_close_through(
    bars: list[Candle],
    start: int,
    end: int,
    price_at: Callable[[int], float],
    long_side: bool,
) -> int | None:
    if start > end:
        return None
    lo = max(0, start)
    hi = min(end, len(bars) - 1)
    for i in range(lo, hi + 1):
        px = price_at(i)
        if long_side and bars[i].close > px:
            return i
        if not long_side and bars[i].close < px:
            return i
    return None


def prices_within_atr(a: float, b: float, atr: float, mult: float) -> bool:
    if atr <= 0:
        return a == b
    return abs(a - b) <= mult * atr


def measured_target(
    long_side: bool,
    line_price: float,
    height: float,
    frac: float,
    entry: float,
    atr: float,
    success_atr_mult: float,
) -> float:
    if long_side:
        raw = line_price + frac * height
        floor = entry + success_atr_mult * atr
        return max(raw, floor)
    raw = line_price - frac * height
    floor = entry - success_atr_mult * atr
    return min(raw, floor)


def structural_stop(
    long_side: bool, entry: float, extreme: float, atr: float, buffer_atr: float
) -> float:
    raw = extreme - buffer_atr * atr if long_side else extreme + buffer_atr * atr
    return sanitize_stop(long_side, entry, raw, atr)


def atr_target_only(long_side: bool, entry: float, atr: float, success_atr_mult: float) -> float:
    if long_side:
        return entry + success_atr_mult * atr
    return entry - success_atr_mult * atr

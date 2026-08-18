"""Pure woodie_open_v1 calculator. No I/O."""

from __future__ import annotations

import math

from app.market.models import Candle
from app.sr.models import (
    GAP_DOWN,
    GAP_FLAT,
    GAP_UP,
    METHOD_WOODIE_OPEN_V1,
    NAMED_LEVELS,
    WoodieLevels,
)


class WoodieInputError(ValueError):
    """Non-finite or inverted H/L inputs."""


def atr_ok(atr: float | None) -> bool:
    return atr is not None and math.isfinite(atr) and atr > 0


def _require_finite(*values: float) -> None:
    for v in values:
        if not math.isfinite(v):
            raise WoodieInputError("Woodie inputs must be finite")


def compute_woodie_open_v1(
    prev_high: float,
    prev_low: float,
    prev_close: float,
    today_open: float,
    *,
    prev_open: float | None = None,
) -> WoodieLevels:
    _require_finite(prev_high, prev_low, prev_close, today_open)
    if prev_open is not None:
        _require_finite(prev_open)
    if prev_high < prev_low:
        raise WoodieInputError("prev_high must be >= prev_low")

    rng = prev_high - prev_low
    pp = (prev_high + prev_low + 2.0 * today_open) / 4.0
    r1 = 2.0 * pp - prev_low
    s1 = 2.0 * pp - prev_high
    r2 = pp + rng
    s2 = pp - rng
    r3 = prev_high + 2.0 * (pp - prev_low)
    s3 = prev_low - 2.0 * (prev_high - pp)
    r4 = r3 + rng
    s4 = s3 - rng
    gap = today_open - prev_close
    gap_pct = (gap / prev_close) if prev_close > 0 else None
    return WoodieLevels(
        method=METHOD_WOODIE_OPEN_V1,
        prev_high=float(prev_high),
        prev_low=float(prev_low),
        prev_close=float(prev_close),
        prev_open=None if prev_open is None else float(prev_open),
        today_open=float(today_open),
        range=float(rng),
        pp=float(pp),
        r1=float(r1),
        s1=float(s1),
        r2=float(r2),
        s2=float(s2),
        r3=float(r3),
        s3=float(s3),
        r4=float(r4),
        s4=float(s4),
        gap=float(gap),
        gap_pct=None if gap_pct is None else float(gap_pct),
    )


def gap_dir(gap: float) -> str:
    if not math.isfinite(gap):
        raise WoodieInputError("gap must be finite")
    if gap > 0:
        return GAP_UP
    if gap < 0:
        return GAP_DOWN
    return GAP_FLAT


def open_through_tokens(today_open: float, lv: WoodieLevels) -> list[str]:
    """Numeric through-tokens. Name order is not price order."""
    _require_finite(today_open)
    out: list[str] = []
    if today_open < lv.s3:
        out.append("s3_down")
    if today_open < lv.s2:
        out.append("s2_down")
    if today_open < lv.s1:
        out.append("s1_down")
    if today_open < lv.pp:
        out.append("pp_down")
    if today_open > lv.pp:
        out.append("pp_up")
    if today_open > lv.r1:
        out.append("r1_up")
    if today_open > lv.r2:
        out.append("r2_up")
    if today_open > lv.r3:
        out.append("r3_up")
    return out


def nearest_level(
    entry: float,
    lv: WoodieLevels,
    *,
    direction: str | None = None,
) -> str:
    _require_finite(entry)
    prices = lv.named_prices()
    best: str | None = None
    best_key: tuple | None = None
    name_rank = {n: i for i, n in enumerate(NAMED_LEVELS)}
    d = (direction or "").lower()
    for name in NAMED_LEVELS:
        dist = abs(entry - prices[name])
        pp_first = 0 if name == "pp" else 1
        if d == "long":
            dir_match = 0 if name.startswith("s") else 1
        elif d == "short":
            dir_match = 0 if name.startswith("r") else 1
        else:
            dir_match = 0
        key = (dist, pp_first, dir_match, name_rank[name])
        if best_key is None or key < best_key:
            best_key = key
            best = name
    assert best is not None
    return best


def _cross_down(bar: Candle, price: float) -> bool:
    return bar.high >= price and bar.close < price


def _cross_up(bar: Candle, price: float) -> bool:
    return bar.low <= price and bar.close > price


def signal_cross(bar: Candle, lv: WoodieLevels) -> str:
    """Total function. Never None when a signal bar exists."""
    prices = lv.named_prices()
    ups = [n for n in NAMED_LEVELS if _cross_up(bar, prices[n])]
    downs = [n for n in NAMED_LEVELS if _cross_down(bar, prices[n])]
    if not ups and not downs:
        return "none"
    if ups and downs:
        if bar.close < bar.open:
            chosen = downs
        elif bar.close > bar.open:
            chosen = ups
        else:
            return "none"
    else:
        chosen = ups or downs
    name_rank = {n: i for i, n in enumerate(NAMED_LEVELS)}
    if chosen is downs:
        pick = min(chosen, key=lambda n: (prices[n], name_rank[n]))
        return f"{pick}_down"
    pick = max(chosen, key=lambda n: (prices[n], -name_rank[n]))
    return f"{pick}_up"

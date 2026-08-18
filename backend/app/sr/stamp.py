"""Freeze Woodie context onto an accepted ActivePattern."""

from __future__ import annotations

from datetime import date

from app.market.models import Candle
from app.patterns.models import ActivePattern, PatternDirection
from app.sr.models import R_STAR, S_STAR, WoodieLevels
from app.sr.woodie import atr_ok, gap_dir, nearest_level, open_through_tokens, signal_cross


def stamp_woodie_sr(
    pattern: ActivePattern,
    signal: Candle | None,
    levels: WoodieLevels,
    *,
    session_date: date,
    near_atr: float = 0.5,
    include_cross: bool = True,
) -> None:
    """Mutate pattern SR fields. Leave unstamped if ATR is not usable."""
    if not atr_ok(pattern.atr_at_detect):
        return
    atr = float(pattern.atr_at_detect)
    direction = (
        pattern.direction.value
        if hasattr(pattern.direction, "value")
        else str(pattern.direction)
    )
    nearest = nearest_level(pattern.entry_price, levels, direction=direction)
    prices = levels.named_prices()
    distance = abs(float(pattern.entry_price) - prices[nearest]) / atr
    near = distance <= float(near_atr)
    confluence = bool(
        near
        and (
            (direction == PatternDirection.LONG.value and nearest in S_STAR)
            or (direction == PatternDirection.SHORT.value and nearest in R_STAR)
        )
    )
    tokens = open_through_tokens(levels.today_open, levels)
    cross: str | None = None
    broke: bool | None = None
    if include_cross and signal is not None:
        cross = signal_cross(signal, levels)
        broke = (
            (direction == PatternDirection.LONG.value and cross in {"r1_up", "r2_up", "r3_up"})
            or (
                direction == PatternDirection.SHORT.value
                and cross in {"s3_down", "s2_down", "s1_down"}
            )
        )
    pattern.sr_method = levels.method
    pattern.sr_session_date = session_date
    pattern.sr_nearest = nearest
    pattern.sr_near = near
    pattern.sr_distance_atr = float(distance)
    pattern.sr_cross = cross
    pattern.sr_confluence = confluence
    pattern.sr_break = broke
    pattern.sr_open_through = ",".join(tokens)
    pattern.sr_gap_dir = gap_dir(levels.gap)
    pattern.sr_ladder_json = levels.ladder_json()

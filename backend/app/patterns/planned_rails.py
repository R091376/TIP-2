"""Planned reward/risk from entry, stop, and target rails.

Used for pattern statistics (avg planned R:R, risk in ATR, reward in ATR).
Computed from final rails at terminal time (includes breakout retest rewrites).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# Regime pattern: range high/low are not a classic long/short trade offer.
_EXCLUDED_PATTERN_TYPES = frozenset({"consolidation"})


@dataclass(frozen=True)
class PlannedRailsMetrics:
    """Per-trade rails: risk_r / reward_r in ATR units; planned_rr = reward/risk.

    Stats aggregate Plan R:R as avg(reward_r) / avg(risk_r) (ratio of averages),
    not the mean of per-trade planned_rr values.
    """

    risk_r: float
    reward_r: float
    planned_rr: float


def compute_planned_rails(
    *,
    pattern_type: str | None,
    direction: str | None,
    entry: float | None,
    stop: float | None,
    target: float | None,
    atr: float | None,
) -> PlannedRailsMetrics | None:
    """
    Return planned rails metrics or None when the setup is not a valid trade offer.

    Rules:
    - Exclude consolidation (and unknown/blank types are still ok if rails valid).
    - Require atr > 0, finite entry/stop/target.
    - risk = |entry − stop| > 0
    - reward = distance entry→target in trade direction > 0
    - planned_rr = reward / risk
    - risk_r / reward_r = distances ÷ ATR
    """
    ptype = (pattern_type or "").strip().lower()
    if ptype in _EXCLUDED_PATTERN_TYPES:
        return None

    try:
        atr_f = float(atr) if atr is not None else 0.0
        entry_f = float(entry) if entry is not None else float("nan")
        stop_f = float(stop) if stop is not None else float("nan")
        target_f = float(target) if target is not None else float("nan")
    except (TypeError, ValueError):
        return None

    if not (atr_f > 0):
        return None
    if not (
        _finite(entry_f) and _finite(stop_f) and _finite(target_f)
    ):
        return None

    risk = abs(entry_f - stop_f)
    if not (risk > 0):
        return None

    short = (direction or "long").strip().lower() == "short"
    reward = (entry_f - target_f) if short else (target_f - entry_f)
    if not (reward > 0):
        return None

    risk_r = risk / atr_f
    reward_r = reward / atr_f
    planned_rr = reward / risk
    return PlannedRailsMetrics(risk_r=risk_r, reward_r=reward_r, planned_rr=planned_rr)


def planned_rails_from_pattern(pattern: Any) -> PlannedRailsMetrics | None:
    """Extract fields from ActivePattern (or duck-typed equivalent)."""
    ptype = pattern.pattern_type
    if hasattr(ptype, "value"):
        ptype = ptype.value
    direction = pattern.direction
    if hasattr(direction, "value"):
        direction = direction.value
    return compute_planned_rails(
        pattern_type=str(ptype) if ptype is not None else None,
        direction=str(direction) if direction is not None else None,
        entry=getattr(pattern, "entry_price", None),
        stop=getattr(pattern, "stop_level", None),
        target=getattr(pattern, "target_level", None),
        atr=getattr(pattern, "atr_at_detect", None),
    )


def _finite(x: float) -> bool:
    return x == x and x not in (float("inf"), float("-inf"))


def median_planned_rr(values: list[float]) -> float | None:
    """Median of per-trade planned R:R values; None if empty."""
    if not values:
        return None
    xs = sorted(float(v) for v in values)
    n = len(xs)
    mid = n // 2
    if n % 2 == 1:
        return xs[mid]
    return (xs[mid - 1] + xs[mid]) / 2.0
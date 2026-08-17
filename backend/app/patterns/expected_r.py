"""Expected R: planned payoff from resolved win rate and planned R:R.

    expected_r = WR × plan_RR − (1 − WR)

Assumes a win collects the planned target and a loss costs 1R (the planned stop).
This is the offer / theoretical edge — not realized path P&L.
"""

from __future__ import annotations


def expected_r(
    resolved_success_rate: float | None,
    planned_rr: float | None,
) -> float | None:
    """Return WR × RR − (1 − WR), or None when either input is missing."""
    if resolved_success_rate is None or planned_rr is None:
        return None
    try:
        wr = float(resolved_success_rate)
        rr = float(planned_rr)
    except (TypeError, ValueError):
        return None
    if wr != wr or rr != rr:  # NaN
        return None
    return wr * rr - (1.0 - wr)

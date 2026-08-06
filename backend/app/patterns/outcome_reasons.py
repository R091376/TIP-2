"""Allowlist of pattern outcome reasons for research filters."""

from __future__ import annotations

# Known terminal / expire reasons observed in detectors + lifecycle helpers.
OUTCOME_REASONS: frozenset[str] = frozenset(
    {
        "startup_recovery",
        "session_close",
        "session_end",
        "max_sessions",
        "max_candles",
        "watchlist_remove",
        "target",
        "stop",
        "expand_up",
        "expand_down",
        # Common detector terminal reasons
        "invalidation",
        "failed",
        "succeeded",
        "max_candles_after_detect",
        "breakout_fail",
        "breakdown_fail",
    }
)

SKIP_EXCURSION_REASONS: frozenset[str] = frozenset({"startup_recovery"})


def is_known_reason(reason: str | None) -> bool:
    if reason is None or str(reason).strip() == "":
        return False
    return str(reason).strip() in OUTCOME_REASONS

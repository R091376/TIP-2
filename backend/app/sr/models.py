from __future__ import annotations

from dataclasses import dataclass

METHOD_WOODIE_OPEN_V1 = "woodie_open_v1"

# Research nearest / cross names. Order is the name-order tie-break, not price order.
NAMED_LEVELS: tuple[str, ...] = ("s3", "s2", "s1", "pp", "r1", "r2", "r3")

S_STAR = frozenset({"s3", "s2", "s1"})
R_STAR = frozenset({"r1", "r2", "r3"})

GAP_UP = "up"
GAP_DOWN = "down"
GAP_FLAT = "flat"

FREEZE_FIRST_RTH = "first_rth_tick"
FREEZE_MID_SESSION = "mid_session_recover"
FREEZE_BACKFILL = "backfill"


@dataclass(frozen=True, slots=True)
class WoodieLevels:
    """Frozen woodie_open_v1 ladder. Named prices may invert on a large gap."""

    method: str
    prev_high: float
    prev_low: float
    prev_close: float
    prev_open: float | None
    today_open: float
    range: float
    pp: float
    r1: float
    s1: float
    r2: float
    s2: float
    r3: float
    s3: float
    r4: float
    s4: float
    gap: float
    gap_pct: float | None

    def named_prices(self) -> dict[str, float]:
        return {
            "s3": self.s3,
            "s2": self.s2,
            "s1": self.s1,
            "pp": self.pp,
            "r1": self.r1,
            "r2": self.r2,
            "r3": self.r3,
        }

    def ladder_json(self) -> dict[str, float | None]:
        return {
            "pp": self.pp,
            "r1": self.r1,
            "s1": self.s1,
            "r2": self.r2,
            "s2": self.s2,
            "r3": self.r3,
            "s3": self.s3,
            "r4": self.r4,
            "s4": self.s4,
            "pdh": self.prev_high,
            "pdl": self.prev_low,
            "pdc": self.prev_close,
            "pdo": self.prev_open,
            "today_open": self.today_open,
            "gap": self.gap,
            "range": self.range,
        }

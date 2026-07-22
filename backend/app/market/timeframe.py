from __future__ import annotations

import re
from dataclasses import dataclass

_PATTERN = re.compile(r"^(\d+)([mhd])$")


@dataclass(frozen=True, slots=True)
class TimeframeSpec:
    unit: str  # minutes | hours | days
    interval: int

    def interval_minutes(self) -> int:
        if self.unit == "minutes":
            return self.interval
        if self.unit == "hours":
            return self.interval * 60
        if self.unit == "days":
            return self.interval * 24 * 60
        raise ValueError(f"Unsupported unit: {self.unit}")


def parse_timeframe(timeframe: str) -> TimeframeSpec:
    m = _PATTERN.match(timeframe)
    if not m:
        raise ValueError(f"Unsupported timeframe: {timeframe}")
    interval = int(m.group(1))
    suffix = m.group(2)
    unit = {"m": "minutes", "h": "hours", "d": "days"}[suffix]
    return TimeframeSpec(unit=unit, interval=interval)

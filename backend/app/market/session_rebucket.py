"""
Re-bucket vendor OHLC series onto NSE session-anchored boundaries (09:15 IST).

Upstox History V3 for NSE already returns 09:15-aligned 5m/15m/1h/4h bars
(verified live). Remapping still:
  - aggregates any off-grid stamps into the correct session bucket
  - drops pre-session / pre-open labeled bars (09:00–09:14, overnight, etc.)
  - keeps seed and live engines on one grid
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.market.candle_boundary import (
    NSE_SESSION_OPEN_MINUTES,
    NSE_ZONE,
    floor_to_candle_start_epoch_second,
    is_session_bar_start,
)
from app.market.models import Candle


@dataclass
class _Agg:
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: int

    @classmethod
    def from_candle(cls, t: int, c: Candle) -> _Agg:
        return cls(t, c.open, c.high, c.low, c.close, c.volume)

    def merge(self, c: Candle) -> None:
        self.high = max(self.high, c.high)
        self.low = min(self.low, c.low)
        self.close = c.close
        self.volume += c.volume

    def to_candle(self) -> Candle:
        return Candle(self.time, self.open, self.high, self.low, self.close, self.volume)


def _minutes_of_day_ist(epoch_seconds: int) -> int:
    dt = datetime.fromtimestamp(int(epoch_seconds), tz=NSE_ZONE)
    return dt.hour * 60 + dt.minute


def rebucket_session_candles(
    candles: list[Candle],
    interval_minutes: int,
) -> list[Candle]:
    """
    Map each candle onto the session floor of its timestamp and aggregate OHLC.

    Daily (interval ≥ 1 day): sorted copy, unchanged.
    """
    if not candles:
        return []
    if interval_minutes <= 0:
        raise ValueError(f"intervalMinutes must be positive: {interval_minutes}")
    if interval_minutes >= 24 * 60:
        return sorted(candles, key=lambda c: c.time)

    buckets: dict[int, _Agg] = {}
    for c in candles:
        # Drop pure pre-open / overnight vendor labels — do not fold into prior RTH bar.
        if _minutes_of_day_ist(c.time) < NSE_SESSION_OPEN_MINUTES:
            continue

        # +1s keeps an on-grid bar start in its own bucket under floor().
        start = floor_to_candle_start_epoch_second(int(c.time) * 1000 + 1000, interval_minutes)
        if not is_session_bar_start(start, interval_minutes):
            continue

        agg = buckets.get(start)
        if agg is None:
            buckets[start] = _Agg.from_candle(start, c)
        else:
            agg.merge(c)

    return [buckets[t].to_candle() for t in sorted(buckets)]

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Candle:
    time: int  # UTC epoch seconds
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass(frozen=True, slots=True)
class Tick:
    instrument_key: str
    price: float
    volume_traded_today: int
    timestamp_ms: int

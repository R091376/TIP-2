from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ResolvedInstrument:
    instrument_key: str
    trading_symbol: str
    exchange: str
    segment: str
    instrument_type: str
    display_name: str


class InstrumentNotFoundException(Exception):
    def __init__(self, trading_symbol: str) -> None:
        super().__init__(f"Instrument not found: {trading_symbol}")
        self.trading_symbol = trading_symbol

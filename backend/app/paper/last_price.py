"""Last price cache — lock sizing and UI only; never used as fill price."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from decimal import Decimal

from app.market.models import Tick


@dataclass(frozen=True, slots=True)
class LtpQuote:
    price: Decimal
    timestamp_ms: int


class LastPriceCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._prices: dict[str, LtpQuote] = {}

    def update(self, tick: Tick) -> None:
        with self._lock:
            self._prices[tick.instrument_key] = LtpQuote(
                price=Decimal(str(tick.price)),
                timestamp_ms=int(tick.timestamp_ms),
            )

    def get(self, instrument_key: str) -> LtpQuote | None:
        with self._lock:
            return self._prices.get(instrument_key)

    def get_price(self, instrument_key: str) -> Decimal | None:
        q = self.get(instrument_key)
        return q.price if q else None

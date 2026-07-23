from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from enum import Enum


class SymbolBootstrapStatus(str, Enum):
    PENDING = "PENDING"
    READY = "READY"
    FAILED = "FAILED"
    REMOVING = "REMOVING"


@dataclass(frozen=True, slots=True)
class WatchlistEntry:
    symbol_id: str
    trading_symbol: str
    exchange: str
    segment: str
    instrument_type: str
    display_name: str
    added_at: datetime
    active: bool
    bootstrap_status: SymbolBootstrapStatus
    bootstrap_error: str | None

    def with_bootstrap(
        self,
        status: SymbolBootstrapStatus,
        error: str | None = None,
        *,
        active: bool | None = None,
    ) -> WatchlistEntry:
        """Copy with updated bootstrap fields (and optional active flag)."""
        return replace(
            self,
            bootstrap_status=status,
            bootstrap_error=error,
            active=self.active if active is None else active,
        )

    def to_dict(self) -> dict:
        return {
            "symbolId": self.symbol_id,
            "tradingSymbol": self.trading_symbol,
            "exchange": self.exchange,
            "segment": self.segment,
            "instrumentType": self.instrument_type,
            "displayName": self.display_name,
            "addedAt": self.added_at.isoformat().replace("+00:00", "Z")
            if self.added_at.tzinfo
            else self.added_at.isoformat(),
            "active": self.active,
            "bootstrapStatus": self.bootstrap_status.value
            if isinstance(self.bootstrap_status, SymbolBootstrapStatus)
            else self.bootstrap_status,
            "bootstrapError": self.bootstrap_error,
        }

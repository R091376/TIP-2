from __future__ import annotations

import threading
from abc import ABC, abstractmethod
from typing import Optional

from app.watchlist.models import SymbolBootstrapStatus, WatchlistEntry


class WatchlistRepository(ABC):
    @abstractmethod
    def find_all_active(self) -> list[WatchlistEntry]: ...

    @abstractmethod
    def find_primary(self) -> Optional[WatchlistEntry]: ...

    @abstractmethod
    def find_by_symbol_id(self, symbol_id: str) -> Optional[WatchlistEntry]: ...

    @abstractmethod
    def contains_symbol_id(self, symbol_id: str) -> bool: ...

    @abstractmethod
    def find_by_trading_symbol_ignore_case(
        self, trading_symbol: str
    ) -> Optional[WatchlistEntry]: ...

    @abstractmethod
    def save(self, entry: WatchlistEntry) -> WatchlistEntry: ...

    @abstractmethod
    def remove(self, symbol_id: str) -> bool: ...

    @abstractmethod
    def count_active(self) -> int: ...


def _is_public_active(e: WatchlistEntry) -> bool:
    return e.active and e.bootstrap_status != SymbolBootstrapStatus.REMOVING


def _norm_ts(trading_symbol: str | None) -> str | None:
    if trading_symbol is None:
        return None
    return trading_symbol.strip().upper()


class InMemoryWatchlistRepository(WatchlistRepository):
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._by_id: dict[str, WatchlistEntry] = {}  # ordered via insertion in 3.7+
        self._order: list[str] = []
        self._trading_index: dict[str, str] = {}

    def find_all_active(self) -> list[WatchlistEntry]:
        with self._lock:
            return [self._by_id[sid] for sid in self._order if _is_public_active(self._by_id[sid])]

    def find_primary(self) -> Optional[WatchlistEntry]:
        active = self.find_all_active()
        return active[0] if active else None

    def find_by_symbol_id(self, symbol_id: str) -> Optional[WatchlistEntry]:
        if symbol_id is None:
            return None
        with self._lock:
            return self._by_id.get(symbol_id)

    def contains_symbol_id(self, symbol_id: str) -> bool:
        if symbol_id is None:
            return False
        with self._lock:
            e = self._by_id.get(symbol_id)
            return e is not None and _is_public_active(e)

    def find_by_trading_symbol_ignore_case(
        self, trading_symbol: str
    ) -> Optional[WatchlistEntry]:
        key = _norm_ts(trading_symbol)
        if not key:
            return None
        with self._lock:
            sid = self._trading_index.get(key)
            if sid is None:
                return None
            e = self._by_id.get(sid)
            if e is None or not _is_public_active(e):
                return None
            return e

    def save(self, entry: WatchlistEntry) -> WatchlistEntry:
        if not entry.symbol_id or not entry.symbol_id.strip():
            raise ValueError("symbolId must not be blank")
        new_key = _norm_ts(entry.trading_symbol)
        if not new_key:
            raise ValueError("tradingSymbol must not be blank")
        with self._lock:
            existing = self._by_id.get(entry.symbol_id)
            if existing is not None:
                to_store = WatchlistEntry(
                    symbol_id=entry.symbol_id,
                    trading_symbol=entry.trading_symbol,
                    exchange=entry.exchange,
                    segment=entry.segment,
                    instrument_type=entry.instrument_type,
                    display_name=entry.display_name,
                    added_at=existing.added_at,
                    active=entry.active,
                    bootstrap_status=entry.bootstrap_status,
                    bootstrap_error=entry.bootstrap_error,
                )
                old_key = _norm_ts(existing.trading_symbol)
                if old_key and old_key != new_key and self._trading_index.get(old_key) == entry.symbol_id:
                    del self._trading_index[old_key]
            else:
                to_store = entry
                if entry.symbol_id not in self._order:
                    self._order.append(entry.symbol_id)
            self._by_id[to_store.symbol_id] = to_store
            self._trading_index[new_key] = to_store.symbol_id
            return to_store

    def remove(self, symbol_id: str) -> bool:
        if symbol_id is None:
            return False
        with self._lock:
            removed = self._by_id.pop(symbol_id, None)
            if removed is None:
                return False
            if symbol_id in self._order:
                self._order.remove(symbol_id)
            key = _norm_ts(removed.trading_symbol)
            if key and self._trading_index.get(key) == symbol_id:
                del self._trading_index[key]
            return True

    def count_active(self) -> int:
        return len(self.find_all_active())

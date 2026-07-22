from __future__ import annotations

import threading
from uuid import UUID

from app.patterns.models import ActivePattern


class ActiveInstanceStore:
    """In-memory open pattern instances keyed by symbol|timeframe."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._by_series: dict[str, dict[UUID, ActivePattern]] = {}

    @staticmethod
    def _key(symbol_id: str, timeframe: str) -> str:
        return f"{symbol_id}|{timeframe}"

    def get_open(self, symbol_id: str, timeframe: str) -> list[ActivePattern]:
        with self._lock:
            series = self._by_series.get(self._key(symbol_id, timeframe), {})
            return [p for p in series.values() if not p.is_terminal()]

    def get_open_for_symbol(self, symbol_id: str) -> list[ActivePattern]:
        with self._lock:
            out: list[ActivePattern] = []
            prefix = symbol_id + "|"
            for k, series in self._by_series.items():
                if k.startswith(prefix):
                    out.extend(p for p in series.values() if not p.is_terminal())
            return out

    def replace_series(
        self, symbol_id: str, timeframe: str, open_patterns: list[ActivePattern]
    ) -> None:
        with self._lock:
            key = self._key(symbol_id, timeframe)
            self._by_series[key] = {p.id: p for p in open_patterns if not p.is_terminal()}

    def remove_symbol(self, symbol_id: str) -> list[ActivePattern]:
        with self._lock:
            removed: list[ActivePattern] = []
            prefix = symbol_id + "|"
            for k in list(self._by_series.keys()):
                if k.startswith(prefix):
                    removed.extend(self._by_series.pop(k).values())
            return removed

    def all_open(self) -> list[ActivePattern]:
        with self._lock:
            out: list[ActivePattern] = []
            for series in self._by_series.values():
                out.extend(p for p in series.values() if not p.is_terminal())
            return out

    def put(self, pattern: ActivePattern) -> None:
        with self._lock:
            key = self._key(pattern.symbol_id, pattern.timeframe)
            series = self._by_series.setdefault(key, {})
            if pattern.is_terminal():
                series.pop(pattern.id, None)
            else:
                series[pattern.id] = pattern

    def remove(self, pattern: ActivePattern) -> None:
        with self._lock:
            key = self._key(pattern.symbol_id, pattern.timeframe)
            series = self._by_series.get(key)
            if series is not None:
                series.pop(pattern.id, None)

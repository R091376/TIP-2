from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Text, select
from sqlalchemy.orm import Mapped, Session, mapped_column, sessionmaker

from app.db.base import Base
from app.watchlist.models import SymbolBootstrapStatus, WatchlistEntry
from app.watchlist.repository import WatchlistRepository, _is_public_active, _norm_ts

logger = logging.getLogger(__name__)

# Re-export helpers used by container
from app.db.session import apply_flyway_sql, create_engine_and_session  # noqa: E402,F401


class WatchlistSymbolRow(Base):
    __tablename__ = "watchlist_symbols"

    symbol_id: Mapped[str] = mapped_column("symbol_id", Text, primary_key=True)
    trading_symbol: Mapped[str] = mapped_column("trading_symbol", Text, nullable=False)
    exchange: Mapped[str] = mapped_column(Text, nullable=False)
    segment: Mapped[str] = mapped_column(Text, nullable=False)
    instrument_type: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str | None] = mapped_column(Text)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    bootstrap_status: Mapped[str] = mapped_column(Text, nullable=False, default="PENDING")
    bootstrap_error: Mapped[str | None] = mapped_column(Text)


class PostgresWatchlistRepository(WatchlistRepository):
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._sf = session_factory

    def find_all_active(self) -> list[WatchlistEntry]:
        with self._sf() as s:
            rows = s.scalars(
                select(WatchlistSymbolRow)
                .where(WatchlistSymbolRow.is_active.is_(True))
                .order_by(WatchlistSymbolRow.added_at.asc())
            ).all()
            entries = [self._to_entry(r) for r in rows]
            return [e for e in entries if _is_public_active(e)]

    def find_primary(self) -> Optional[WatchlistEntry]:
        active = self.find_all_active()
        return active[0] if active else None

    def find_by_symbol_id(self, symbol_id: str) -> Optional[WatchlistEntry]:
        if not symbol_id:
            return None
        with self._sf() as s:
            row = s.get(WatchlistSymbolRow, symbol_id)
            return self._to_entry(row) if row else None

    def contains_symbol_id(self, symbol_id: str) -> bool:
        e = self.find_by_symbol_id(symbol_id)
        return e is not None and _is_public_active(e)

    def find_by_trading_symbol_ignore_case(
        self, trading_symbol: str
    ) -> Optional[WatchlistEntry]:
        key = _norm_ts(trading_symbol)
        if not key:
            return None
        with self._sf() as s:
            rows = s.scalars(
                select(WatchlistSymbolRow).where(WatchlistSymbolRow.is_active.is_(True))
            ).all()
            for r in rows:
                if _norm_ts(r.trading_symbol) == key:
                    e = self._to_entry(r)
                    if _is_public_active(e):
                        return e
        return None

    def save(self, entry: WatchlistEntry) -> WatchlistEntry:
        with self._sf() as s:
            row = s.get(WatchlistSymbolRow, entry.symbol_id)
            if row is None:
                row = WatchlistSymbolRow(
                    symbol_id=entry.symbol_id,
                    trading_symbol=entry.trading_symbol,
                    exchange=entry.exchange,
                    segment=entry.segment,
                    instrument_type=entry.instrument_type,
                    display_name=entry.display_name,
                    added_at=entry.added_at,
                    is_active=entry.active,
                    bootstrap_status=(
                        entry.bootstrap_status.value
                        if isinstance(entry.bootstrap_status, SymbolBootstrapStatus)
                        else str(entry.bootstrap_status)
                    ),
                    bootstrap_error=entry.bootstrap_error,
                )
                s.add(row)
            else:
                row.trading_symbol = entry.trading_symbol
                row.exchange = entry.exchange
                row.segment = entry.segment
                row.instrument_type = entry.instrument_type
                row.display_name = entry.display_name
                row.is_active = entry.active
                if not entry.active:
                    row.removed_at = datetime.now(timezone.utc)
                row.bootstrap_status = (
                    entry.bootstrap_status.value
                    if isinstance(entry.bootstrap_status, SymbolBootstrapStatus)
                    else str(entry.bootstrap_status)
                )
                row.bootstrap_error = entry.bootstrap_error
            s.commit()
            s.refresh(row)
            return self._to_entry(row)

    def remove(self, symbol_id: str) -> bool:
        with self._sf() as s:
            row = s.get(WatchlistSymbolRow, symbol_id)
            if row is None:
                return False
            row.is_active = False
            row.removed_at = datetime.now(timezone.utc)
            s.commit()
            return True

    def count_active(self) -> int:
        return len(self.find_all_active())

    @staticmethod
    def _to_entry(row: WatchlistSymbolRow) -> WatchlistEntry:
        status = SymbolBootstrapStatus(row.bootstrap_status)
        added = row.added_at
        if added.tzinfo is None:
            added = added.replace(tzinfo=timezone.utc)
        return WatchlistEntry(
            symbol_id=row.symbol_id,
            trading_symbol=row.trading_symbol,
            exchange=row.exchange or "NSE",
            segment=row.segment or "NSE_EQ",
            instrument_type=row.instrument_type or "EQ",
            display_name=row.display_name or row.trading_symbol,
            added_at=added,
            active=row.is_active,
            bootstrap_status=status,
            bootstrap_error=row.bootstrap_error,
        )

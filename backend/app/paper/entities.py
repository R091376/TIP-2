"""SQLAlchemy rows for paper trading tables."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.journal.entities import GUID


class PaperOrderRow(Base):
    __tablename__ = "paper_orders"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("app_users.id", ondelete="CASCADE"))
    client_order_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    instrument_key: Mapped[str] = mapped_column(Text, nullable=False)
    trading_symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    side: Mapped[str] = mapped_column(String(8), nullable=False)
    order_type: Mapped[str] = mapped_column(String(8), nullable=False)
    working_order_type: Mapped[str] = mapped_column(String(8), nullable=False)
    product: Mapped[str] = mapped_column(String(8), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    filled_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    trigger_price: Mapped[Decimal | None] = mapped_column(Numeric(18, 4), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    reject_reason: Mapped[str | None] = mapped_column(String(256), nullable=True)
    close_lot_id: Mapped[UUID | None] = mapped_column(GUID(), nullable=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="USER")
    accept_seq: Mapped[int] = mapped_column(BigInteger, nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_tick_ms: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PaperFillRow(Base):
    __tablename__ = "paper_fills"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    order_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("paper_orders.id", ondelete="CASCADE"))
    user_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("app_users.id", ondelete="CASCADE"))
    instrument_key: Mapped[str] = mapped_column(Text, nullable=False)
    side: Mapped[str] = mapped_column(String(8), nullable=False)
    qty: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    tick_ts_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    lot_id: Mapped[UUID | None] = mapped_column(GUID(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PaperLotRow(Base):
    __tablename__ = "paper_position_lots"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("app_users.id", ondelete="CASCADE"))
    instrument_key: Mapped[str] = mapped_column(Text, nullable=False)
    trading_symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    side: Mapped[str] = mapped_column(String(8), nullable=False)
    product: Mapped[str] = mapped_column(String(8), nullable=False)
    qty_open: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_closed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_entry_price: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    entry_order_id: Mapped[UUID | None] = mapped_column(
        GUID(), ForeignKey("paper_orders.id"), nullable=True
    )
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PaperCashLockRow(Base):
    __tablename__ = "paper_cash_locks"

    id: Mapped[UUID] = mapped_column(GUID(), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(GUID(), ForeignKey("app_users.id", ondelete="CASCADE"))
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(32), nullable=False)
    order_id: Mapped[UUID | None] = mapped_column(
        GUID(), ForeignKey("paper_orders.id", ondelete="CASCADE"), nullable=True
    )
    lot_id: Mapped[UUID | None] = mapped_column(
        GUID(), ForeignKey("paper_position_lots.id", ondelete="CASCADE"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

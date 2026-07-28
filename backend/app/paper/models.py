"""Domain enums and dataclasses for paper trading."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID


class Side(StrEnum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(StrEnum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    SL = "SL"
    SL_M = "SL_M"


class WorkingOrderType(StrEnum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    NONE = "NONE"


class Product(StrEnum):
    MIS = "MIS"
    CNC = "CNC"


class OrderStatus(StrEnum):
    OPEN = "OPEN"
    TRIGGER_PENDING = "TRIGGER_PENDING"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class LotSide(StrEnum):
    LONG = "LONG"
    SHORT = "SHORT"


class LotStatus(StrEnum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class OrderSource(StrEnum):
    USER = "USER"
    SYSTEM_SQUARE_OFF = "SYSTEM_SQUARE_OFF"


class LockReason(StrEnum):
    ORDER = "ORDER"
    SHORT_MARGIN = "SHORT_MARGIN"


class Intent(StrEnum):
    OPEN_LONG = "OPEN_LONG"
    CLOSE_LONG = "CLOSE_LONG"
    OPEN_SHORT = "OPEN_SHORT"
    COVER_SHORT = "COVER_SHORT"


OPEN_STATUSES = frozenset(
    {
        OrderStatus.OPEN,
        OrderStatus.TRIGGER_PENDING,
        OrderStatus.PARTIALLY_FILLED,
    }
)

TERMINAL_STATUSES = frozenset(
    {
        OrderStatus.FILLED,
        OrderStatus.CANCELLED,
        OrderStatus.REJECTED,
        OrderStatus.EXPIRED,
    }
)


@dataclass
class PaperOrder:
    id: UUID
    user_id: UUID
    instrument_key: str
    trading_symbol: str
    side: Side
    order_type: OrderType
    working_order_type: WorkingOrderType
    product: Product
    qty: int
    filled_qty: int = 0
    price: Decimal | None = None
    trigger_price: Decimal | None = None
    status: OrderStatus = OrderStatus.OPEN
    reject_reason: str | None = None
    close_lot_id: UUID | None = None
    source: OrderSource = OrderSource.USER
    client_order_id: str | None = None
    accept_seq: int = 0
    accepted_at: datetime | None = None
    accepted_tick_ms: int | None = None
    triggered_at: datetime | None = None
    completed_at: datetime | None = None
    version: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None
    # process-local: market-ready after this seen_tick_seq
    market_ready_after_seq: int = 0
    warmup_required: bool = False

    @property
    def remaining(self) -> int:
        return max(0, self.qty - self.filled_qty)

    def derive_status(self) -> OrderStatus:
        if self.status in TERMINAL_STATUSES:
            return self.status
        if self.order_type in (OrderType.SL, OrderType.SL_M) and self.triggered_at is None:
            if self.filled_qty == 0:
                return OrderStatus.TRIGGER_PENDING
        if self.filled_qty <= 0:
            return OrderStatus.OPEN
        if self.filled_qty < self.qty:
            return OrderStatus.PARTIALLY_FILLED
        return OrderStatus.FILLED


@dataclass
class PaperFill:
    id: UUID
    order_id: UUID
    user_id: UUID
    instrument_key: str
    side: Side
    qty: int
    price: Decimal
    amount: Decimal
    tick_ts_ms: int
    lot_id: UUID | None
    created_at: datetime


@dataclass
class PositionLot:
    id: UUID
    user_id: UUID
    instrument_key: str
    trading_symbol: str
    side: LotSide
    product: Product
    qty_open: int
    qty_closed: int = 0
    avg_entry_price: Decimal = Decimal("0")
    realized_pnl: Decimal = Decimal("0")
    status: LotStatus = LotStatus.OPEN
    entry_order_id: UUID | None = None
    opened_at: datetime | None = None
    closed_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass
class CashLock:
    id: UUID
    user_id: UUID
    amount: Decimal
    reason: LockReason
    order_id: UUID | None = None
    lot_id: UUID | None = None
    created_at: datetime | None = None
    released_at: datetime | None = None

    @property
    def is_open(self) -> bool:
        return self.released_at is None


@dataclass
class LedgerEntry:
    entry_type: str
    amount: Decimal
    balance_after: Decimal
    note: str | None = None


@dataclass
class CashAccount:
    """Mutable cash + locks for one user (in-process)."""

    user_id: UUID
    cash_balance: Decimal
    locks: list[CashLock] = field(default_factory=list)
    ledger: list[LedgerEntry] = field(default_factory=list)

    def open_locks(self) -> list[CashLock]:
        return [lk for lk in self.locks if lk.is_open]

    def locked_cash(self) -> Decimal:
        from app.user.service import money

        return money(sum((lk.amount for lk in self.open_locks()), Decimal("0")))

    def free_cash(self) -> Decimal:
        from app.user.service import money

        return money(self.cash_balance - self.locked_cash())

    def order_lock(self, order_id: UUID) -> CashLock | None:
        for lk in self.open_locks():
            if lk.reason == LockReason.ORDER and lk.order_id == order_id:
                return lk
        return None

    def lot_margin_lock(self, lot_id: UUID) -> CashLock | None:
        for lk in self.open_locks():
            if lk.reason == LockReason.SHORT_MARGIN and lk.lot_id == lot_id:
                return lk
        return None

"""Postgres persistence helpers for paper book."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.paper.charges import ChargeCode, ChargeLine
from app.paper.entities import (
    PaperCashLockRow,
    PaperFillChargeRow,
    PaperFillRow,
    PaperLotRow,
    PaperOrderRow,
)
from app.paper.models import (
    CashAccount,
    CashLock,
    LockReason,
    LotSide,
    LotStatus,
    OrderSource,
    OrderStatus,
    OrderType,
    PaperFill,
    PaperOrder,
    PositionLot,
    Product,
    Side,
    WorkingOrderType,
)
from app.user.service import money


def upsert_order(sf: sessionmaker[Session], order: PaperOrder) -> None:
    with sf() as s:
        row = s.get(PaperOrderRow, order.id)
        if row is None:
            row = PaperOrderRow(id=order.id)
            s.add(row)
        row.user_id = order.user_id
        row.client_order_id = order.client_order_id
        row.instrument_key = order.instrument_key
        row.trading_symbol = order.trading_symbol
        row.side = order.side.value
        row.order_type = order.order_type.value
        row.working_order_type = order.working_order_type.value
        row.product = order.product.value
        row.qty = order.qty
        row.filled_qty = order.filled_qty
        row.price = order.price
        row.trigger_price = order.trigger_price
        row.status = order.status.value
        row.reject_reason = order.reject_reason
        row.close_lot_id = order.close_lot_id
        row.source = order.source.value
        row.accept_seq = order.accept_seq
        row.accepted_at = order.accepted_at
        row.accepted_tick_ms = order.accepted_tick_ms
        row.triggered_at = order.triggered_at
        row.completed_at = order.completed_at
        row.version = order.version
        row.created_at = order.created_at or datetime.now(timezone.utc)
        row.updated_at = order.updated_at or datetime.now(timezone.utc)
        s.commit()


def insert_fill(sf: sessionmaker[Session], fill: PaperFill) -> None:
    with sf() as s:
        s.add(
            PaperFillRow(
                id=fill.id,
                order_id=fill.order_id,
                user_id=fill.user_id,
                instrument_key=fill.instrument_key,
                side=fill.side.value,
                qty=fill.qty,
                price=fill.price,
                amount=fill.amount,
                tick_ts_ms=fill.tick_ts_ms,
                lot_id=fill.lot_id,
                created_at=fill.created_at,
                charges_total=fill.charges_total,
                schedule_id=fill.schedule_id,
                schedule_version=fill.schedule_version,
                allocated_entry_charges=fill.allocated_entry_charges,
                realized_pnl=fill.realized_pnl,
            )
        )
        for ln in fill.charges:
            if ln.amount <= 0:
                continue
            s.add(
                PaperFillChargeRow(
                    id=uuid4(),
                    fill_id=fill.id,
                    user_id=fill.user_id,
                    code=str(ln.code),
                    amount=ln.amount,
                    created_at=fill.created_at,
                )
            )
        s.commit()


def upsert_lot(sf: sessionmaker[Session], lot: PositionLot) -> None:
    with sf() as s:
        row = s.get(PaperLotRow, lot.id)
        if row is None:
            row = PaperLotRow(id=lot.id)
            s.add(row)
        row.user_id = lot.user_id
        row.instrument_key = lot.instrument_key
        row.trading_symbol = lot.trading_symbol
        row.side = lot.side.value
        row.product = lot.product.value
        row.qty_open = lot.qty_open
        row.qty_closed = lot.qty_closed
        row.avg_entry_price = lot.avg_entry_price
        row.realized_pnl = lot.realized_pnl
        row.charges_entry = lot.charges_entry
        row.charges_exit = lot.charges_exit
        row.status = lot.status.value
        row.entry_order_id = lot.entry_order_id
        row.opened_at = lot.opened_at or datetime.now(timezone.utc)
        row.closed_at = lot.closed_at
        row.updated_at = lot.updated_at or datetime.now(timezone.utc)
        s.commit()


def sync_locks(sf: sessionmaker[Session], acc: CashAccount) -> None:
    """Best-effort: upsert open locks and mark released."""
    with sf() as s:
        for lk in acc.locks:
            row = s.get(PaperCashLockRow, lk.id)
            if row is None:
                row = PaperCashLockRow(id=lk.id)
                s.add(row)
            row.user_id = acc.user_id
            row.amount = lk.amount
            row.reason = lk.reason.value
            row.order_id = lk.order_id
            row.lot_id = lk.lot_id
            row.created_at = lk.created_at or datetime.now(timezone.utc)
            row.released_at = lk.released_at
        s.commit()


def load_book(sf: sessionmaker[Session]) -> dict:
    with sf() as s:
        order_rows = list(s.scalars(select(PaperOrderRow)).all())
        lot_rows = list(s.scalars(select(PaperLotRow)).all())
        fill_rows = list(s.scalars(select(PaperFillRow)).all())
        lock_rows = list(s.scalars(select(PaperCashLockRow)).all())
        charge_rows = list(s.scalars(select(PaperFillChargeRow)).all())

    orders: dict[UUID, PaperOrder] = {}
    for r in order_rows:
        orders[r.id] = PaperOrder(
            id=r.id,
            user_id=r.user_id,
            instrument_key=r.instrument_key,
            trading_symbol=r.trading_symbol,
            side=Side(r.side),
            order_type=OrderType(r.order_type),
            working_order_type=WorkingOrderType(r.working_order_type),
            product=Product(r.product),
            qty=r.qty,
            filled_qty=r.filled_qty,
            price=Decimal(str(r.price)) if r.price is not None else None,
            trigger_price=Decimal(str(r.trigger_price)) if r.trigger_price is not None else None,
            status=OrderStatus(r.status),
            reject_reason=r.reject_reason,
            close_lot_id=r.close_lot_id,
            source=OrderSource(r.source),
            client_order_id=r.client_order_id,
            accept_seq=int(r.accept_seq),
            accepted_at=r.accepted_at,
            accepted_tick_ms=r.accepted_tick_ms,
            triggered_at=r.triggered_at,
            completed_at=r.completed_at,
            version=r.version,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )

    lots: dict[UUID, PositionLot] = {}
    for r in lot_rows:
        lots[r.id] = PositionLot(
            id=r.id,
            user_id=r.user_id,
            instrument_key=r.instrument_key,
            trading_symbol=r.trading_symbol,
            side=LotSide(r.side),
            product=Product(r.product),
            qty_open=r.qty_open,
            qty_closed=r.qty_closed,
            avg_entry_price=Decimal(str(r.avg_entry_price)),
            realized_pnl=money(r.realized_pnl),
            charges_entry=money(r.charges_entry),
            charges_exit=money(r.charges_exit),
            status=LotStatus(r.status),
            entry_order_id=r.entry_order_id,
            opened_at=r.opened_at,
            closed_at=r.closed_at,
            updated_at=r.updated_at,
        )

    charges_by_fill: dict[UUID, list[ChargeLine]] = {}
    for cr in charge_rows:
        charges_by_fill.setdefault(cr.fill_id, []).append(
            ChargeLine(code=ChargeCode(cr.code), amount=money(cr.amount))
        )

    fills = [
        PaperFill(
            id=r.id,
            order_id=r.order_id,
            user_id=r.user_id,
            instrument_key=r.instrument_key,
            side=Side(r.side),
            qty=r.qty,
            price=Decimal(str(r.price)),
            amount=money(r.amount),
            tick_ts_ms=int(r.tick_ts_ms),
            lot_id=r.lot_id,
            created_at=r.created_at,
            charges_total=money(r.charges_total),
            charges=tuple(charges_by_fill.get(r.id, ())),
            schedule_id=r.schedule_id,
            schedule_version=int(r.schedule_version),
            realized_pnl=money(r.realized_pnl) if r.realized_pnl is not None else None,
            allocated_entry_charges=(
                money(r.allocated_entry_charges)
                if r.allocated_entry_charges is not None
                else None
            ),
        )
        for r in fill_rows
    ]

    locks_by_user: dict[UUID, list[CashLock]] = {}
    for r in lock_rows:
        locks_by_user.setdefault(r.user_id, []).append(
            CashLock(
                id=r.id,
                user_id=r.user_id,
                amount=money(r.amount),
                reason=LockReason(r.reason),
                order_id=r.order_id,
                lot_id=r.lot_id,
                created_at=r.created_at,
                released_at=r.released_at,
            )
        )

    return {
        "orders": orders,
        "lots": lots,
        "fills": fills,
        "locks_by_user": locks_by_user,
    }

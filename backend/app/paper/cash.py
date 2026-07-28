"""Cash lock + fill funding pure logic (unit-testable)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID, uuid4

from app.paper.models import (
    CashAccount,
    CashLock,
    Intent,
    LedgerEntry,
    LockReason,
    OrderType,
    PaperOrder,
    PositionLot,
    Side,
)
from app.user.service import money


class AbortFill(Exception):
    """Fill cannot proceed under cash rules; caller adjusts qty or cancels."""


@dataclass(frozen=True, slots=True)
class FillCashResult:
    fill_qty: int
    cash_balance: Decimal
    free_cash: Decimal
    ledger: list[LedgerEntry]
    cancel_residual: bool
    cancel_reason: str | None = None


def resolve_intent(order: PaperOrder) -> Intent:
    if order.close_lot_id is None:
        return Intent.OPEN_LONG if order.side == Side.BUY else Intent.OPEN_SHORT
    # Closing: BUY covers short, SELL closes long
    if order.side == Side.BUY:
        return Intent.COVER_SHORT
    return Intent.CLOSE_LONG


def lock_reference_price(
    order_type: OrderType,
    price: Decimal | None,
    ltp: Decimal | None,
    market_lock_haircut: Decimal = Decimal("1.02"),
) -> Decimal | None:
    if order_type in (OrderType.LIMIT, OrderType.SL):
        return price
    if order_type in (OrderType.MARKET, OrderType.SL_M):
        if ltp is None or ltp <= 0:
            return None
        return money(ltp * market_lock_haircut)
    return None


def required_order_lock_amount(
    intent: Intent,
    qty_remaining: int,
    lock_px: Decimal | None,
) -> Decimal:
    """Lock at accept for open long/short; 0 for closes."""
    if intent in (Intent.CLOSE_LONG, Intent.COVER_SHORT):
        return money(0)
    if lock_px is None or qty_remaining <= 0:
        return money(0)
    return money(Decimal(qty_remaining) * lock_px)


def spendable_for_order(account: CashAccount, order_id: UUID) -> Decimal:
    """cash_balance - other_locks == free + this_order_lock."""
    this_lock = account.order_lock(order_id)
    this_amt = this_lock.amount if this_lock else money(0)
    other = money(account.locked_cash() - this_amt)
    return money(account.cash_balance - other)


def affordable_open_long_qty(
    account: CashAccount,
    order_id: UUID,
    attempt: int,
    fill_px: Decimal,
) -> int:
    if attempt <= 0 or fill_px <= 0:
        return 0
    spendable = spendable_for_order(account, order_id)
    if spendable <= 0:
        return 0
    max_qty = int(spendable // fill_px)
    return max(0, min(attempt, max_qty))


def recompute_order_lock(
    account: CashAccount,
    order: PaperOrder,
    lock_unit_px: Decimal,
    now_released_at=None,
) -> None:
    """Set ORDER lock to lock_unit_px * remaining; release if zero."""
    remaining = order.remaining
    desired = money(Decimal(remaining) * lock_unit_px) if remaining > 0 else money(0)
    lk = account.order_lock(order.id)
    if desired <= 0:
        if lk:
            lk.released_at = now_released_at or __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            )
        return
    if lk is None:
        from datetime import datetime, timezone

        account.locks.append(
            CashLock(
                id=uuid4(),
                user_id=account.user_id,
                amount=desired,
                reason=LockReason.ORDER,
                order_id=order.id,
                created_at=datetime.now(timezone.utc),
            )
        )
    else:
        lk.amount = desired


def release_order_lock(account: CashAccount, order_id: UUID, when) -> None:
    lk = account.order_lock(order_id)
    if lk:
        lk.released_at = when


def ensure_short_margin(
    account: CashAccount,
    lot: PositionLot,
    entry_notional: Decimal,
    when,
) -> None:
    """1× short margin on lot = entry_notional for open qty (caller passes full)."""
    desired = money(entry_notional)
    lk = account.lot_margin_lock(lot.id)
    if desired <= 0:
        if lk:
            lk.released_at = when
        return
    if lk is None:
        account.locks.append(
            CashLock(
                id=uuid4(),
                user_id=account.user_id,
                amount=desired,
                reason=LockReason.SHORT_MARGIN,
                lot_id=lot.id,
                created_at=when,
            )
        )
    else:
        lk.amount = desired


def apply_fill_cash(
    account: CashAccount,
    order: PaperOrder,
    lot: PositionLot | None,
    fill_qty: int,
    fill_px: Decimal,
    when,
    *,
    cancel_unfunded_market: bool = True,
) -> FillCashResult:
    """
    Apply cash effects for a fill. Caller must pass pre-capped fill_qty for open_long
    when needed, or we re-cap here.
    """
    if fill_qty <= 0:
        raise AbortFill("fill_qty must be positive")
    intent = resolve_intent(order)
    fill_px = Decimal(str(fill_px))
    notional = money(Decimal(fill_qty) * fill_px)
    ledger: list[LedgerEntry] = []
    cancel_residual = False
    cancel_reason: str | None = None

    if intent == Intent.OPEN_LONG:
        # Cap by spendable
        affordable = affordable_open_long_qty(account, order.id, fill_qty, fill_px)
        if affordable <= 0:
            if cancel_unfunded_market and order.working_order_type.value == "MARKET":
                return FillCashResult(
                    fill_qty=0,
                    cash_balance=account.cash_balance,
                    free_cash=account.free_cash(),
                    ledger=[],
                    cancel_residual=True,
                    cancel_reason="INSUFFICIENT_CASH_AT_FILL",
                )
            raise AbortFill("INSUFFICIENT_CASH_AT_FILL")
        if affordable < fill_qty:
            fill_qty = affordable
            notional = money(Decimal(fill_qty) * fill_px)
            if cancel_unfunded_market and order.working_order_type.value == "MARKET":
                cancel_residual = True
                cancel_reason = "INSUFFICIENT_CASH_AT_FILL"
        spendable = spendable_for_order(account, order.id)
        if notional > spendable:
            raise AbortFill("INSUFFICIENT_CASH_AT_FILL")
        # Adjust ORDER lock for remaining qty after this fill.
        # MARKET residual cancel releases the full residual lock (no leave-behind).
        rem_before = order.remaining
        lk = account.order_lock(order.id)
        if lk and rem_before > 0:
            new_rem = rem_before - fill_qty
            if new_rem <= 0 or cancel_residual:
                lk.released_at = when
            else:
                unit = money(lk.amount / Decimal(rem_before)) if rem_before else money(0)
                lk.amount = money(unit * Decimal(new_rem))
        account.cash_balance = money(account.cash_balance - notional)
        ledger.append(
            LedgerEntry("BUY", money(-notional), account.cash_balance, f"OPEN_LONG fill {fill_qty}@{fill_px}")
        )

    elif intent == Intent.CLOSE_LONG:
        account.cash_balance = money(account.cash_balance + notional)
        ledger.append(
            LedgerEntry("SELL", notional, account.cash_balance, f"CLOSE_LONG fill {fill_qty}@{fill_px}")
        )

    elif intent == Intent.OPEN_SHORT:
        rem_before = order.remaining
        lk = account.order_lock(order.id)
        if lk and rem_before > 0:
            unit = money(lk.amount / Decimal(rem_before)) if rem_before else money(0)
            new_rem = rem_before - fill_qty
            if new_rem <= 0:
                lk.released_at = when
            else:
                lk.amount = money(unit * Decimal(new_rem))
        # margin set by caller after lot known
        ledger.append(
            LedgerEntry(
                "SELL",
                money(0),
                account.cash_balance,
                f"OPEN_SHORT notional={notional} qty={fill_qty}@{fill_px}",
            )
        )

    elif intent == Intent.COVER_SHORT:
        if lot is None:
            raise AbortFill("cover requires lot")
        entry = Decimal(str(lot.avg_entry_price))
        pnl = money((entry - fill_px) * Decimal(fill_qty))
        # release margin portion
        ml = account.lot_margin_lock(lot.id)
        if ml and lot.qty_open > 0:
            unit = money(ml.amount / Decimal(lot.qty_open))
            new_open = lot.qty_open - fill_qty
            if new_open <= 0:
                ml.released_at = when
            else:
                ml.amount = money(unit * Decimal(new_open))
        new_bal = money(account.cash_balance + pnl)
        if new_bal < 0:
            ledger.append(
                LedgerEntry(
                    "ADJUST",
                    money(-account.cash_balance),
                    money(0),
                    "short blow-up floor",
                )
            )
            account.cash_balance = money(0)
        else:
            account.cash_balance = new_bal
            ledger.append(
                LedgerEntry(
                    "SQUARE_OFF",
                    pnl,
                    account.cash_balance,
                    f"COVER_SHORT fill {fill_qty}@{fill_px}",
                )
            )
    else:
        raise AbortFill(f"unknown intent {intent}")

    free = account.free_cash()
    if account.cash_balance < 0:
        raise AbortFill("cash_balance negative")
    if free < 0:
        raise AbortFill("free_cash negative")

    account.ledger.extend(ledger)
    return FillCashResult(
        fill_qty=fill_qty,
        cash_balance=account.cash_balance,
        free_cash=free,
        ledger=ledger,
        cancel_residual=cancel_residual,
        cancel_reason=cancel_reason,
    )

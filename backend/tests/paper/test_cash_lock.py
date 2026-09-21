"""Pure cash lock / fill-funding tests (examples A–F from design)."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from app.paper.cash import (
    affordable_open_long_qty,
    affordable_open_long_qty_with_charges,
    apply_fill_cash,
    debit_fee,
    required_order_lock_amount,
    resolve_intent,
    spendable_for_order,
)
from app.paper.models import (
    CashAccount,
    CashLock,
    Intent,
    LockReason,
    LotSide,
    OrderType,
    PaperOrder,
    PositionLot,
    Product,
    Side,
    WorkingOrderType,
)
from app.user.service import money


def _order(
    *,
    side=Side.BUY,
    close=None,
    qty=10,
    working=WorkingOrderType.MARKET,
) -> PaperOrder:
    return PaperOrder(
        id=uuid4(),
        user_id=uuid4(),
        instrument_key="NSE_EQ|RELIANCE",
        trading_symbol="RELIANCE",
        side=side,
        order_type=OrderType.MARKET,
        working_order_type=working,
        product=Product.MIS,
        qty=qty,
        close_lot_id=close,
    )


def test_spendable_ignores_other_locks_example_f():
    uid = uuid4()
    oid = uuid4()
    acc = CashAccount(user_id=uid, cash_balance=money(10_000))
    # short margin 5000 + order lock 4080
    acc.locks.append(
        CashLock(id=uuid4(), user_id=uid, amount=money(5000), reason=LockReason.SHORT_MARGIN, lot_id=uuid4())
    )
    acc.locks.append(
        CashLock(id=uuid4(), user_id=uid, amount=money(4080), reason=LockReason.ORDER, order_id=oid)
    )
    assert spendable_for_order(acc, oid) == money(5000)
    assert affordable_open_long_qty(acc, oid, 40, Decimal("100")) == 40
    assert affordable_open_long_qty(acc, oid, 40, Decimal("130")) == 38


def test_example_b_partial_at_130():
    uid = uuid4()
    order = _order(qty=40)
    order.user_id = uid
    acc = CashAccount(user_id=uid, cash_balance=money(5000))
    acc.locks.append(
        CashLock(
            id=uuid4(),
            user_id=uid,
            amount=money(4080),
            reason=LockReason.ORDER,
            order_id=order.id,
        )
    )
    now = datetime.now(timezone.utc)
    res = apply_fill_cash(acc, order, None, 40, Decimal("130"), now)
    assert res.fill_qty == 38
    assert res.cancel_residual is True
    assert res.cancel_reason == "INSUFFICIENT_CASH_AT_FILL"
    assert acc.cash_balance == money(5000 - 38 * 130)
    assert acc.free_cash() >= money(0)


def test_example_a_full_fill_adverse_uptick():
    uid = uuid4()
    order = _order(qty=10)
    order.user_id = uid
    acc = CashAccount(user_id=uid, cash_balance=money(100_000))
    acc.locks.append(
        CashLock(
            id=uuid4(),
            user_id=uid,
            amount=money(1020),
            reason=LockReason.ORDER,
            order_id=order.id,
        )
    )
    now = datetime.now(timezone.utc)
    res = apply_fill_cash(acc, order, None, 10, Decimal("110"), now)
    assert res.fill_qty == 10
    assert acc.cash_balance == money(98_900)


def test_close_long_credits_cash():
    uid = uuid4()
    lot_id = uuid4()
    order = _order(side=Side.SELL, close=lot_id, qty=10)
    order.user_id = uid
    lot = PositionLot(
        id=lot_id,
        user_id=uid,
        instrument_key="NSE_EQ|RELIANCE",
        trading_symbol="RELIANCE",
        side=LotSide.LONG,
        product=Product.MIS,
        qty_open=10,
        avg_entry_price=Decimal("100"),
    )
    acc = CashAccount(user_id=uid, cash_balance=money(50_000))
    now = datetime.now(timezone.utc)
    res = apply_fill_cash(acc, order, lot, 10, Decimal("105"), now)
    assert res.fill_qty == 10
    assert acc.cash_balance == money(51_050)
    assert resolve_intent(order) == Intent.CLOSE_LONG


def test_open_short_lock_amount():
    need = required_order_lock_amount(Intent.OPEN_SHORT, 10, Decimal("102"))
    assert need == money(1020)
    assert required_order_lock_amount(Intent.CLOSE_LONG, 10, Decimal("102")) == money(0)


def test_cover_short_pnl():
    uid = uuid4()
    lot_id = uuid4()
    order = _order(side=Side.BUY, close=lot_id, qty=10)
    order.user_id = uid
    lot = PositionLot(
        id=lot_id,
        user_id=uid,
        instrument_key="NSE_EQ|RELIANCE",
        trading_symbol="RELIANCE",
        side=LotSide.SHORT,
        product=Product.MIS,
        qty_open=10,
        avg_entry_price=Decimal("100"),
    )
    acc = CashAccount(user_id=uid, cash_balance=money(100_000))
    acc.locks.append(
        CashLock(
            id=uuid4(),
            user_id=uid,
            amount=money(1000),
            reason=LockReason.SHORT_MARGIN,
            lot_id=lot_id,
        )
    )
    now = datetime.now(timezone.utc)
    res = apply_fill_cash(acc, order, lot, 10, Decimal("120"), now)
    assert res.fill_qty == 10
    # pnl -200
    assert acc.cash_balance == money(99_800)


def test_affordable_open_long_qty_with_charges_binary_search():
    uid = uuid4()
    oid = uuid4()
    acc = CashAccount(user_id=uid, cash_balance=money(5000))
    acc.locks.append(
        CashLock(id=uuid4(), user_id=uid, amount=money(4080), reason=LockReason.ORDER, order_id=oid)
    )
    # notional-only cap is 38; constant 70 of charges pushes one share off
    q = affordable_open_long_qty_with_charges(
        acc, oid, 40, Decimal("130"), lambda _q: money("70")
    )
    assert q == 37
    assert money(Decimal(37) * Decimal("130")) + money("70") <= money(5000)
    assert money(Decimal(38) * Decimal("130")) + money("70") > money(5000)

    q_fit = affordable_open_long_qty_with_charges(
        acc, oid, 40, Decimal("130"), lambda _q: money("2.07")
    )
    assert q_fit == 38


def test_debit_fee_only_no_adjust():
    uid = uuid4()
    acc = CashAccount(user_id=uid, cash_balance=money(1000))
    fill_id = uuid4()
    entry = debit_fee(acc, money("0.42"), fill_id=fill_id, schedule_id="nse_eq_cash_v1")
    assert entry.entry_type == "FEE"
    assert entry.amount == money("-0.42")
    assert acc.cash_balance == money("999.58")
    assert [e.entry_type for e in acc.ledger] == ["FEE"]
    assert "ADJUST" not in {e.entry_type for e in acc.ledger}
    assert str(fill_id) in (entry.note or "")
    assert "nse_eq_cash_v1" in (entry.note or "")


def test_fee_capped_collected_min_computed_cash():
    uid = uuid4()
    acc = CashAccount(user_id=uid, cash_balance=money("0.20"))
    computed = money("0.42")
    collected = min(computed, acc.cash_balance)
    assert collected == money("0.20")
    debit_fee(acc, collected, fill_id=uuid4(), schedule_id="nse_eq_cash_v1")
    assert acc.cash_balance == money(0)
    assert acc.ledger[-1].entry_type == "FEE"
    assert acc.ledger[-1].amount == money("-0.20")
    assert all(e.entry_type != "ADJUST" for e in acc.ledger)

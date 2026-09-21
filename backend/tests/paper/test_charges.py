"""Pure NSE cash charge engine tests (worked examples + overlay)."""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

from app.config import Settings
from app.paper.charges import (
    NSE_EQ_CASH_V1,
    ChargeCode,
    ChargeContext,
    ChargeSchedule,
    compute_charges,
    load_charge_schedule,
)
from app.paper.models import Intent, Product, Side
from app.user.service import money


def _ctx(
    *,
    side: Side,
    product: Product,
    intent: Intent,
    qty: int = 10,
    price: Decimal = Decimal("100"),
    dp_already_charged_today: bool = False,
) -> ChargeContext:
    px = Decimal(str(price))
    return ChargeContext(
        side=side,
        product=product,
        intent=intent,
        qty=qty,
        price=px,
        notional=money(Decimal(qty) * px),
        dp_already_charged_today=dp_already_charged_today,
    )


def _amt(bd, code: ChargeCode) -> Decimal:
    for ln in bd.lines:
        if ln.code == code:
            return ln.amount
    raise AssertionError(f"missing {code}")


def test_open_long_mis_10_at_100_total_0_42():
    ctx = _ctx(side=Side.BUY, product=Product.MIS, intent=Intent.OPEN_LONG)
    bd = compute_charges(ctx, NSE_EQ_CASH_V1, enabled=True)
    assert _amt(bd, ChargeCode.BROKERAGE) == money("0.30")
    assert _amt(bd, ChargeCode.STT) == money("0")
    assert _amt(bd, ChargeCode.EXCHANGE_TXN) == money("0.03")
    assert _amt(bd, ChargeCode.SEBI) == money("0")
    assert _amt(bd, ChargeCode.STAMP) == money("0.03")
    assert _amt(bd, ChargeCode.GST) == money("0.06")
    assert _amt(bd, ChargeCode.DP) == money("0")
    # Design table listed 0.72 (brokerage double-counted). Later PRs: entry=0.42, exit=0.67, net=48.91.
    assert bd.total == money("0.42")
    assert bd.total == money(sum((ln.amount for ln in bd.lines), Decimal("0")))
    assert bd.schedule_id == "nse_eq_cash_v1"
    codes = {ln.code for ln in bd.persistable_lines()}
    assert ChargeCode.STT not in codes
    assert ChargeCode.SEBI not in codes
    assert ChargeCode.DP not in codes


def test_close_long_mis_10_at_105_total_0_67():
    ctx = _ctx(
        side=Side.SELL,
        product=Product.MIS,
        intent=Intent.CLOSE_LONG,
        price=Decimal("105"),
    )
    bd = compute_charges(ctx, NSE_EQ_CASH_V1, enabled=True)
    assert _amt(bd, ChargeCode.BROKERAGE) == money("0.32")
    assert _amt(bd, ChargeCode.STT) == money("0.26")
    assert _amt(bd, ChargeCode.EXCHANGE_TXN) == money("0.03")
    assert _amt(bd, ChargeCode.STAMP) == money("0")
    assert _amt(bd, ChargeCode.GST) == money("0.06")
    assert bd.total == money("0.67")


def test_cnc_vs_mis_stt():
    mis_buy = compute_charges(
        _ctx(side=Side.BUY, product=Product.MIS, intent=Intent.OPEN_LONG),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    cnc_buy = compute_charges(
        _ctx(side=Side.BUY, product=Product.CNC, intent=Intent.OPEN_LONG),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    mis_sell = compute_charges(
        _ctx(side=Side.SELL, product=Product.MIS, intent=Intent.CLOSE_LONG),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    cnc_sell = compute_charges(
        _ctx(side=Side.SELL, product=Product.CNC, intent=Intent.CLOSE_LONG),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    open_short = compute_charges(
        _ctx(side=Side.SELL, product=Product.MIS, intent=Intent.OPEN_SHORT),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    cover = compute_charges(
        _ctx(side=Side.BUY, product=Product.MIS, intent=Intent.COVER_SHORT),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    assert _amt(mis_buy, ChargeCode.STT) == money("0")
    assert _amt(cnc_buy, ChargeCode.STT) == money("1.00")
    assert _amt(mis_sell, ChargeCode.STT) == money("0.25")
    assert _amt(cnc_sell, ChargeCode.STT) == money("1.00")
    assert _amt(open_short, ChargeCode.STT) == money("0.25")
    assert _amt(cover, ChargeCode.STT) == money("0")


def test_stamp_buy_only_delivery_vs_intraday():
    mis_buy = compute_charges(
        _ctx(side=Side.BUY, product=Product.MIS, intent=Intent.OPEN_LONG),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    cnc_buy = compute_charges(
        _ctx(side=Side.BUY, product=Product.CNC, intent=Intent.OPEN_LONG),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    mis_sell = compute_charges(
        _ctx(side=Side.SELL, product=Product.MIS, intent=Intent.CLOSE_LONG),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    cnc_sell = compute_charges(
        _ctx(side=Side.SELL, product=Product.CNC, intent=Intent.CLOSE_LONG),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    cover = compute_charges(
        _ctx(side=Side.BUY, product=Product.MIS, intent=Intent.COVER_SHORT),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    open_short = compute_charges(
        _ctx(side=Side.SELL, product=Product.MIS, intent=Intent.OPEN_SHORT),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    assert _amt(mis_buy, ChargeCode.STAMP) == money("0.03")
    assert _amt(cnc_buy, ChargeCode.STAMP) == money("0.15")
    assert _amt(mis_sell, ChargeCode.STAMP) == money("0")
    assert _amt(cnc_sell, ChargeCode.STAMP) == money("0")
    assert _amt(cover, ChargeCode.STAMP) == money("0.03")
    assert _amt(open_short, ChargeCode.STAMP) == money("0")


def test_gst_base_excludes_stt_and_stamp():
    # CNC buy: brokerage 0, exchange 0.03, stamp 0.15. GST on 0.03 → 0.01
    # (including stamp would be 0.03).
    cnc_buy = compute_charges(
        _ctx(side=Side.BUY, product=Product.CNC, intent=Intent.OPEN_LONG),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    assert _amt(cnc_buy, ChargeCode.BROKERAGE) == money("0")
    assert _amt(cnc_buy, ChargeCode.EXCHANGE_TXN) == money("0.03")
    assert _amt(cnc_buy, ChargeCode.STAMP) == money("0.15")
    assert _amt(cnc_buy, ChargeCode.GST) == money("0.01")


def test_flag_off_and_qty_non_positive_zeros():
    ctx = _ctx(side=Side.BUY, product=Product.MIS, intent=Intent.OPEN_LONG)
    off = compute_charges(ctx, NSE_EQ_CASH_V1, enabled=False)
    assert off.lines == ()
    assert off.total == money("0")
    assert off.schedule_id == "off"

    zero_qty = _ctx(side=Side.BUY, product=Product.MIS, intent=Intent.OPEN_LONG, qty=0)
    z = compute_charges(zero_qty, NSE_EQ_CASH_V1, enabled=True)
    assert z.lines == ()
    assert z.total == money("0")
    assert z.schedule_id == "off"


def test_brokerage_cap_and_zero_pct():
    big = compute_charges(
        _ctx(
            side=Side.BUY,
            product=Product.MIS,
            intent=Intent.OPEN_LONG,
            qty=10_000,
            price=Decimal("100"),
        ),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    assert _amt(big, ChargeCode.BROKERAGE) == money("20.00")

    zero_pct = replace(NSE_EQ_CASH_V1, brokerage_pct=Decimal("0"))
    z = compute_charges(
        _ctx(side=Side.BUY, product=Product.MIS, intent=Intent.OPEN_LONG),
        zero_pct,
        enabled=True,
    )
    assert _amt(z, ChargeCode.BROKERAGE) == money("0")


def test_dp_once_vs_second_sell():
    sched = replace(NSE_EQ_CASH_V1, dp_flat=Decimal("13.50"))
    first = compute_charges(
        _ctx(side=Side.SELL, product=Product.CNC, intent=Intent.CLOSE_LONG),
        sched,
        enabled=True,
    )
    second = compute_charges(
        _ctx(
            side=Side.SELL,
            product=Product.CNC,
            intent=Intent.CLOSE_LONG,
            dp_already_charged_today=True,
        ),
        sched,
        enabled=True,
    )
    mis_sell = compute_charges(
        _ctx(side=Side.SELL, product=Product.MIS, intent=Intent.CLOSE_LONG),
        sched,
        enabled=True,
    )
    assert _amt(first, ChargeCode.DP) == money("13.50")
    assert _amt(second, ChargeCode.DP) == money("0")
    assert _amt(mis_sell, ChargeCode.DP) == money("0")
    # DP in GST base: 18% × (0 + 0.03 + 0 + 13.50) = 2.44
    assert _amt(first, ChargeCode.GST) == money("2.44")
    assert _amt(second, ChargeCode.GST) == money("0.01")


def test_rounding_money_half_up_not_whole_rupee_stt():
    assert money("0.005") == Decimal("0.01")
    assert money("0.004") == Decimal("0.00")
    # STT 0.025% × ₹100 = 0.025 → 0.03 paise, not rounded to ₹0 / ₹1.
    bd = compute_charges(
        _ctx(
            side=Side.SELL,
            product=Product.MIS,
            intent=Intent.CLOSE_LONG,
            qty=1,
            price=Decimal("100"),
        ),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    assert _amt(bd, ChargeCode.STT) == money("0.03")


def test_overlay_decimal_string_applied():
    s = Settings(paper_charges_schedule_json='{"nse_txn_pct": "0.0000297", "version": 2}')
    sched = load_charge_schedule(s)
    assert sched.nse_txn_pct == Decimal("0.0000297")
    assert sched.version == 2
    assert sched.id == "nse_eq_cash_v1"
    assert sched.brokerage_pct == NSE_EQ_CASH_V1.brokerage_pct


def test_overlay_json_number_rejected():
    s = Settings(paper_charges_schedule_json='{"nse_txn_pct": 0.0000297}')
    sched = load_charge_schedule(s)
    assert sched.nse_txn_pct == NSE_EQ_CASH_V1.nse_txn_pct
    assert sched.version == NSE_EQ_CASH_V1.version


def test_overlay_legacy_stamp_buy_pct():
    both = load_charge_schedule(
        Settings(paper_charges_schedule_json='{"stamp_buy_pct": "0.0001"}')
    )
    assert both.stamp_buy_delivery_pct == Decimal("0.0001")
    assert both.stamp_buy_intraday_pct == Decimal("0.0001")

    override = load_charge_schedule(
        Settings(
            paper_charges_schedule_json=(
                '{"stamp_buy_pct": "0.0001", "stamp_buy_delivery_pct": "0.0002"}'
            )
        )
    )
    assert override.stamp_buy_delivery_pct == Decimal("0.0002")
    assert override.stamp_buy_intraday_pct == Decimal("0.0001")

    rejected = load_charge_schedule(
        Settings(paper_charges_schedule_json='{"stamp_buy_pct": 0.0001}')
    )
    assert rejected.stamp_buy_delivery_pct == NSE_EQ_CASH_V1.stamp_buy_delivery_pct
    assert rejected.stamp_buy_intraday_pct == NSE_EQ_CASH_V1.stamp_buy_intraday_pct


def test_overlay_invalid_json_and_unknown_id_fallback():
    bad = load_charge_schedule(Settings(paper_charges_schedule_json="{not json"))
    assert bad is NSE_EQ_CASH_V1 or bad == NSE_EQ_CASH_V1
    unknown = load_charge_schedule(Settings(paper_charges_schedule_id="nope"))
    assert unknown == NSE_EQ_CASH_V1
    overlay_id = load_charge_schedule(
        Settings(paper_charges_schedule_json='{"id": "other", "nse_txn_pct": "0.0000297"}')
    )
    assert overlay_id.nse_txn_pct == NSE_EQ_CASH_V1.nse_txn_pct


def test_default_schedule_is_nse_eq_cash_v1():
    s = Settings()
    assert s.paper_charges_enabled is False
    assert s.paper_charges_schedule_id == "nse_eq_cash_v1"
    assert s.paper_charges_schedule_json == ""
    sched = load_charge_schedule(s)
    assert isinstance(sched, ChargeSchedule)
    assert sched == NSE_EQ_CASH_V1


def _alloc_svc(*, charges: bool = True, cash: Decimal = Decimal("100000")):
    from uuid import uuid4

    from app.paper.service import PaperTradingService
    from app.watchlist.repository import InMemoryWatchlistRepository

    uid = uuid4()
    svc = PaperTradingService(
        Settings(
            paper_enabled=True,
            paper_allow_memory=True,
            paper_charges_enabled=charges,
        ),
        InMemoryWatchlistRepository(),
        session_factory=None,
        user_cash_provider=lambda _u: cash,
        user_cash_writer=lambda *_a, **_k: None,
    )
    return svc, uid


def _mk_order(uid, *, side, qty, close_lot_id=None, product=Product.MIS):
    from datetime import datetime, timezone
    from uuid import uuid4

    from app.paper.models import OrderStatus, OrderType, PaperOrder, WorkingOrderType

    now = datetime.now(timezone.utc)
    return PaperOrder(
        id=uuid4(),
        user_id=uid,
        instrument_key="NSE_EQ|RELIANCE",
        trading_symbol="RELIANCE",
        side=side,
        order_type=OrderType.MARKET,
        working_order_type=WorkingOrderType.MARKET,
        product=product,
        qty=qty,
        filled_qty=0,
        status=OrderStatus.OPEN,
        close_lot_id=close_lot_id,
        created_at=now,
        updated_at=now,
    )


def test_charges_alloc_two_step_4_then_6():
    from datetime import datetime, timezone

    from app.paper.models import OrderStatus, Side
    from app.user.service import money

    svc, uid = _alloc_svc()
    acc = svc._account(uid)
    now = datetime.now(timezone.utc)
    open_o = _mk_order(uid, side=Side.BUY, qty=10)
    open_o.status = OrderStatus.OPEN
    out = svc._apply_fill(acc, open_o, None, 10, Decimal("100"), now, tick_ts_ms=1)
    assert out is not None and out.fill is not None
    lot = out.lot
    assert lot is not None
    assert lot.charges_entry == money("0.42")
    assert out.fill.realized_pnl is None
    assert out.fill.allocated_entry_charges is None
    assert acc.cash_balance == money("100000") - money("1000.42")

    close4 = _mk_order(uid, side=Side.SELL, qty=4, close_lot_id=lot.id)
    out4 = svc._apply_fill(acc, close4, lot, 4, Decimal("105"), now, tick_ts_ms=2)
    assert out4 is not None and out4.fill is not None
    alloc4 = out4.fill.allocated_entry_charges
    assert alloc4 == money(lot.charges_entry * Decimal(4) / Decimal(10))

    close6 = _mk_order(uid, side=Side.SELL, qty=6, close_lot_id=lot.id)
    out6 = svc._apply_fill(acc, close6, lot, 6, Decimal("105"), now, tick_ts_ms=3)
    assert out6 is not None and out6.fill is not None
    assert money(alloc4 + out6.fill.allocated_entry_charges) == money("0.42")
    assert lot.qty_open == 0
    assert lot.charges_entry == money("0.42")
    dto = svc._lot_dto(lot)
    assert dto["chargesRemaining"] == 0.0
    assert out4.fill.realized_pnl is not None
    assert out6.fill.realized_pnl is not None
    assert money(out4.fill.realized_pnl + out6.fill.realized_pnl) == lot.realized_pnl
    assert out6.fill.realized_pnl != lot.realized_pnl


def test_charges_alloc_paise_residual_three_singles():
    from datetime import datetime, timezone

    from app.paper.models import OrderStatus, Side
    from app.user.service import money

    svc, uid = _alloc_svc()
    acc = svc._account(uid)
    now = datetime.now(timezone.utc)
    open_o = _mk_order(uid, side=Side.BUY, qty=3)
    open_o.status = OrderStatus.OPEN
    out = svc._apply_fill(acc, open_o, None, 3, Decimal("100"), now, tick_ts_ms=1)
    assert out is not None and out.lot is not None
    lot = out.lot
    lot.charges_entry = money("0.01")
    allocs = []
    for i in range(3):
        close = _mk_order(uid, side=Side.SELL, qty=1, close_lot_id=lot.id)
        got = svc._apply_fill(acc, close, lot, 1, Decimal("100"), now, tick_ts_ms=2 + i)
        assert got is not None and got.fill is not None
        allocs.append(got.fill.allocated_entry_charges)
    assert allocs[0] == money("0.00")
    assert allocs[1] == money("0.00")
    assert allocs[2] == money("0.01")
    assert money(sum(allocs, Decimal("0"))) == money("0.01")


def test_full_round_trip_net_realized_48_91():
    from datetime import datetime, timezone

    from app.paper.models import OrderStatus, Side
    from app.user.service import money

    svc, uid = _alloc_svc()
    acc = svc._account(uid)
    now = datetime.now(timezone.utc)
    open_o = _mk_order(uid, side=Side.BUY, qty=10)
    open_o.status = OrderStatus.OPEN
    out = svc._apply_fill(acc, open_o, None, 10, Decimal("100"), now, tick_ts_ms=1)
    assert out is not None and out.lot is not None
    assert acc.cash_balance == money("98999.58")
    lot = out.lot
    close = _mk_order(uid, side=Side.SELL, qty=10, close_lot_id=lot.id)
    got = svc._apply_fill(acc, close, lot, 10, Decimal("105"), now, tick_ts_ms=2)
    assert got is not None and got.fill is not None
    assert got.fill.allocated_entry_charges == money("0.42")
    assert got.fill.charges_total == money("0.67")
    assert got.fill.realized_pnl == money("48.91")
    assert lot.realized_pnl == money("48.91")
    assert lot.avg_entry_price == Decimal("100") or lot.avg_entry_price == Decimal("100.0000")

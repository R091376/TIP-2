from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from app.backtest.fills import SimTrade, expire_open, on_bar, stamp_sim_charges
from app.market.models import Candle
from app.paper.charges import ChargeContext, NSE_EQ_CASH_V1, compute_charges
from app.paper.models import Intent, Product, Side
from app.user.service import money


def _trade(**kwargs):
    base = dict(
        id=uuid4(),
        instance_id="i1",
        symbol_id="NSE_EQ|X",
        trading_symbol="X",
        timeframe="5m",
        pattern_type="breakout",
        direction="long",
        detect_time=1_700_000_000,
        entry=100.0,
        stop=98.0,
        target=104.0,
        qty=1,
        flag_confirmed=True,
        flag_retested=False,
        volume_ok=True,
        pending=True,
    )
    base.update(kwargs)
    return SimTrade(**base)


def test_fill_next_open_then_stop_wins_if_both_in_bar():
    t = _trade()
    fill_bar = Candle(1_700_000_300, 100.5, 105.0, 97.0, 101.0, 1000)
    on_bar(
        [t],
        fill_bar,
        stop_wins=True,
        product="CNC",
        close_minutes=930,
        mis_hhmm="15:20",
    )
    assert t.fill_entry == 100.5
    assert t.outcome == "stop"
    assert t.fill_exit == 98.0
    assert t.r_multiple is not None and t.r_multiple < 0


def test_target_hit_when_stop_not_in_bar():
    t = _trade()
    fill_bar = Candle(1_700_000_300, 100.2, 100.4, 100.0, 100.3, 1000)
    on_bar([t], fill_bar, stop_wins=True, product="CNC", close_minutes=930, mis_hhmm="15:20")
    assert t.outcome is None
    win = Candle(1_700_000_600, 101.0, 104.5, 100.8, 104.2, 1000)
    on_bar([t], win, stop_wins=True, product="CNC", close_minutes=930, mis_hhmm="15:20")
    assert t.outcome == "target"
    assert t.r_multiple and t.r_multiple > 0
    assert t.pnl == (104.0 - 100.2) * 1
    from app.backtest.fills import pnl_pct, to_row

    row = to_row(t)
    assert row["pnlPct"] == pnl_pct(t)
    assert abs(row["pnlPct"] - t.pnl / t.fill_entry) < 1e-12
    gross = t.pnl
    r_gross = t.r_multiple
    stamp_sim_charges([t], Product.CNC, NSE_EQ_CASH_V1)
    assert t.pnl == gross
    assert t.r_multiple == r_gross
    entry_px = Decimal(str(t.fill_entry))
    exit_px = Decimal(str(t.fill_exit))
    entry_bd = compute_charges(
        ChargeContext(
            side=Side.BUY,
            product=Product.CNC,
            intent=Intent.OPEN_LONG,
            qty=1,
            price=entry_px,
            notional=money(entry_px),
        ),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    exit_bd = compute_charges(
        ChargeContext(
            side=Side.SELL,
            product=Product.CNC,
            intent=Intent.CLOSE_LONG,
            qty=1,
            price=exit_px,
            notional=money(exit_px),
        ),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    assert t.pnl_net == float(money(Decimal(str(gross)) - entry_bd.total - exit_bd.total))
    assert t.charges_entry == float(entry_bd.total)
    assert t.charges_exit == float(exit_bd.total)
    assert t.charges_total == float(money(entry_bd.total + exit_bd.total))
    row_net = to_row(t)
    assert row_net["pnl"] == t.pnl
    assert row_net["pnlNet"] == t.pnl_net
    assert row_net["rMultiple"] == t.r_multiple
    assert row_net["rMultipleNet"] == t.r_multiple_net


def test_entry_reached_copies_pattern_reclaim():
    from types import SimpleNamespace

    from app.backtest.fills import sync_flags

    t = _trade(pending=False, fill_entry=105.0, flag_retested=False)
    p = SimpleNamespace(
        id="i1",
        flag_confirmed=True,
        flag_retested=True,
        flag_reclaimed=False,
        volume_ok_at_detect=True,
    )
    bar = Candle(1_700_000_600, 104.0, 106.0, 103.0, 105.0, 1000)
    sync_flags([t], [p], bar)
    assert t.flag_retested is True
    assert t.flag_entry_reached is False
    p.flag_reclaimed = True
    sync_flags([t], [p], bar)
    assert t.flag_entry_reached is True


def test_retest_without_reclaim_does_not_set_entry_reached():
    from types import SimpleNamespace

    from app.backtest.fills import sync_flags

    t = _trade(pending=False, fill_entry=105.0, flag_retested=False)
    p = SimpleNamespace(
        id="i1",
        flag_confirmed=True,
        flag_retested=True,
        flag_reclaimed=False,
        volume_ok_at_detect=True,
    )
    retest_bar = Candle(1_700_000_600, 104.0, 106.0, 100.1, 100.8, 1000)
    sync_flags([t], [p], retest_bar)
    assert t.flag_retested is True
    assert t.flag_entry_reached is False


def test_expire_open_at_end():
    t = _trade(pending=False, fill_entry=100.0, entry_time=1)
    last = Candle(1_700_001_000, 100.0, 100.5, 99.5, 100.2, 10)
    expire_open([t], last)
    assert t.outcome == "expired"


def test_stamp_short_uses_open_short_and_cover_short():
    t = _trade(direction="short", entry=100.0, stop=102.0, target=96.0)
    fill_bar = Candle(1_700_000_300, 100.2, 100.4, 100.0, 100.3, 1000)
    on_bar([t], fill_bar, stop_wins=True, product="MIS", close_minutes=930, mis_hhmm="15:20")
    assert t.outcome is None
    win = Candle(1_700_000_600, 99.0, 99.2, 95.5, 96.0, 1000)
    on_bar([t], win, stop_wins=True, product="MIS", close_minutes=930, mis_hhmm="15:20")
    assert t.outcome == "target"
    assert t.fill_entry == 100.2
    assert t.fill_exit == 96.0
    assert t.pnl == (100.2 - 96.0) * 1
    gross = t.pnl
    stamp_sim_charges([t], Product.MIS, NSE_EQ_CASH_V1)
    assert t.pnl == gross
    entry_px = Decimal(str(t.fill_entry))
    exit_px = Decimal(str(t.fill_exit))
    entry_bd = compute_charges(
        ChargeContext(
            side=Side.SELL,
            product=Product.MIS,
            intent=Intent.OPEN_SHORT,
            qty=1,
            price=entry_px,
            notional=money(entry_px),
        ),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    exit_bd = compute_charges(
        ChargeContext(
            side=Side.BUY,
            product=Product.MIS,
            intent=Intent.COVER_SHORT,
            qty=1,
            price=exit_px,
            notional=money(exit_px),
        ),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    swapped_entry = compute_charges(
        ChargeContext(
            side=Side.BUY,
            product=Product.MIS,
            intent=Intent.OPEN_LONG,
            qty=1,
            price=entry_px,
            notional=money(entry_px),
        ),
        NSE_EQ_CASH_V1,
        enabled=True,
    )
    assert t.charges_entry == float(entry_bd.total)
    assert t.charges_exit == float(exit_bd.total)
    assert t.pnl_net == float(money(Decimal(str(gross)) - entry_bd.total - exit_bd.total))
    assert t.charges_entry != float(swapped_entry.total)


def test_stamp_leaves_open_net_none():
    t = _trade()
    fill_bar = Candle(1_700_000_300, 100.2, 100.4, 100.0, 100.3, 1000)
    on_bar([t], fill_bar, stop_wins=True, product="CNC", close_minutes=930, mis_hhmm="15:20")
    assert t.outcome is None
    stamp_sim_charges([t], Product.CNC, NSE_EQ_CASH_V1)
    assert t.pnl_net is None
    assert t.charges_total is None
    assert t.r_multiple_net is None


def test_stamp_dp_once_per_symbol_ist_exit_date():
    from dataclasses import replace

    sched = replace(NSE_EQ_CASH_V1, dp_flat=Decimal("13.50"))
    a = _trade(pending=False, fill_entry=100.0, entry_time=1)
    b = _trade(id=uuid4(), instance_id="i2", pending=False, fill_entry=100.0, entry_time=1)
    last = Candle(1_700_001_000, 100.0, 100.5, 99.5, 100.2, 10)
    expire_open([a, b], last)
    stamp_sim_charges([a, b], Product.CNC, sched)
    assert a.charges_exit is not None and b.charges_exit is not None
    # DP + GST-on-DP lands on the first CNC close that IST day only.
    assert abs(a.charges_exit - b.charges_exit) >= float(money("13.50"))


def test_stamp_leaves_no_fill_net_none():
    t = _trade()
    last = Candle(1_700_001_000, 100.0, 100.5, 99.5, 100.2, 10)
    expire_open([t], last)
    assert t.outcome == "no_fill"
    stamp_sim_charges([t], Product.CNC, NSE_EQ_CASH_V1)
    assert t.pnl is None
    assert t.pnl_net is None
    assert t.charges_entry is None
    assert t.charges_exit is None
    assert t.charges_total is None
    assert t.r_multiple_net is None

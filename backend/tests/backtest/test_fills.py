from __future__ import annotations

from app.backtest.fills import SimTrade, expire_open, on_bar
from app.market.models import Candle
from uuid import uuid4


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

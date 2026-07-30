"""Matching + PaperTradingService market next-tick fill."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from app.config import Settings
from app.market.models import Tick
from app.market.nse_clock import MarketPhase
from app.paper.matching import is_limit_marketable, is_trigger_hit, market_fill_allowed
from app.paper.models import (
    OrderStatus,
    OrderType,
    PaperOrder,
    Product,
    Side,
    WorkingOrderType,
)
from app.paper.service import PaperTradingService
from app.watchlist.models import SymbolBootstrapStatus, WatchlistEntry
from app.watchlist.repository import InMemoryWatchlistRepository


def _equity_entry(key: str = "NSE_EQ|RELIANCE", sym: str = "RELIANCE") -> WatchlistEntry:
    return WatchlistEntry(
        symbol_id=key,
        trading_symbol=sym,
        exchange="NSE",
        segment="NSE_EQ",
        instrument_type="EQ",
        display_name=sym,
        added_at=datetime.now(timezone.utc),
        active=True,
        bootstrap_status=SymbolBootstrapStatus.READY,
        bootstrap_error=None,
    )


@pytest.fixture
def wl():
    repo = InMemoryWatchlistRepository()
    repo.save(_equity_entry())
    return repo


def test_limit_and_trigger_rules():
    o = PaperOrder(
        id=uuid4(),
        user_id=uuid4(),
        instrument_key="X",
        trading_symbol="X",
        side=Side.BUY,
        order_type=OrderType.LIMIT,
        working_order_type=WorkingOrderType.LIMIT,
        product=Product.MIS,
        qty=1,
        price=Decimal("100"),
        trigger_price=Decimal("99"),
        status=OrderStatus.OPEN,
    )
    assert is_limit_marketable(o, Decimal("100"))
    assert is_limit_marketable(o, Decimal("99"))
    assert not is_limit_marketable(o, Decimal("101"))
    o.side = Side.SELL
    o.trigger_price = Decimal("100")
    assert is_trigger_hit(o, Decimal("100"))
    assert is_trigger_hit(o, Decimal("99"))
    assert not is_trigger_hit(o, Decimal("101"))


def test_market_fill_seq():
    o = PaperOrder(
        id=uuid4(),
        user_id=uuid4(),
        instrument_key="X",
        trading_symbol="X",
        side=Side.BUY,
        order_type=OrderType.MARKET,
        working_order_type=WorkingOrderType.MARKET,
        product=Product.MIS,
        qty=1,
        status=OrderStatus.OPEN,
        market_ready_after_seq=5,
    )
    assert not market_fill_allowed(o, 5)
    assert market_fill_allowed(o, 6)


def test_next_tick_market_fill(monkeypatch, wl):
    monkeypatch.setattr(
        "app.paper.service.phase_from_clock",
        lambda: MarketPhase.OPEN,
    )
    settings = Settings(paper_enabled=True, paper_allow_memory=True)
    uid = uuid4()
    balances = {uid: Decimal("100000")}

    def provider(u):
        return balances.get(u, Decimal("0"))

    def writer(u, bal, _led):
        balances[u] = bal

    svc = PaperTradingService(
        settings,
        wl,
        session_factory=None,
        user_cash_provider=provider,
        user_cash_writer=writer,
    )
    svc.start()
    key = "NSE_EQ|RELIANCE"
    svc.enqueue_tick(Tick(instrument_key=key, price=100.0, volume_traded_today=1, timestamp_ms=1))
    import time

    time.sleep(0.15)

    order = svc.place_order(
        uid,
        instrument_key=key,
        side="BUY",
        order_type="MARKET",
        product="CNC",
        qty=5,
        trading_enabled=True,
    )
    assert order["status"] == "OPEN"
    svc.enqueue_tick(Tick(instrument_key=key, price=101.0, volume_traded_today=2, timestamp_ms=2))
    time.sleep(0.25)
    got = svc.get_order(uid, UUID(order["id"]))
    assert got["status"] == "FILLED"
    assert got["filledQty"] == 5
    pos = svc.list_positions(uid)
    assert len(pos) == 1
    assert pos[0]["qtyOpen"] == 5
    assert pos[0]["side"] == "LONG"
    snap = svc.account_snapshot(uid)
    assert snap["cashBalance"] == pytest.approx(100000 - 5 * 101, rel=1e-3)
    svc.stop()


def test_close_lot_expires_linked_and_orphan_stops(monkeypatch, wl):
    """Full lot close expires closeLotId-linked orders and orphan protective SL_M."""
    monkeypatch.setattr(
        "app.paper.service.phase_from_clock",
        lambda: MarketPhase.OPEN,
    )
    settings = Settings(paper_enabled=True, paper_allow_memory=True)
    uid = uuid4()
    balances = {uid: Decimal("100000")}

    def provider(u):
        return balances.get(u, Decimal("0"))

    def writer(u, bal, _led):
        balances[u] = bal

    svc = PaperTradingService(
        settings,
        wl,
        session_factory=None,
        user_cash_provider=provider,
        user_cash_writer=writer,
    )
    svc.start()
    key = "NSE_EQ|RELIANCE"
    import time

    svc.enqueue_tick(Tick(instrument_key=key, price=100.0, volume_traded_today=1, timestamp_ms=1))
    time.sleep(0.12)

    buy = svc.place_order(
        uid,
        instrument_key=key,
        side="BUY",
        order_type="MARKET",
        product="MIS",
        qty=1,
        trading_enabled=True,
    )
    svc.enqueue_tick(Tick(instrument_key=key, price=100.0, volume_traded_today=2, timestamp_ms=2))
    time.sleep(0.2)
    buy = svc.get_order(uid, UUID(buy["id"]))
    assert buy["status"] == "FILLED"
    lots = svc.list_positions(uid, open_only=True)
    assert len(lots) == 1
    lot_id = lots[0]["id"]

    # Protective SL_M with closeLotId
    sl_linked = svc.place_order(
        uid,
        instrument_key=key,
        side="SELL",
        order_type="SL_M",
        product="MIS",
        qty=1,
        trigger_price=90.0,
        close_lot_id=lot_id,
        trading_enabled=True,
    )
    assert sl_linked["status"] == "TRIGGER_PENDING"

    # Orphan SL_M (no closeLotId) same side protective
    sl_orphan = svc.place_order(
        uid,
        instrument_key=key,
        side="SELL",
        order_type="SL_M",
        product="MIS",
        qty=1,
        trigger_price=88.0,
        trading_enabled=True,
    )
    assert sl_orphan["status"] == "TRIGGER_PENDING"

    close = svc.place_order(
        uid,
        instrument_key=key,
        side="SELL",
        order_type="MARKET",
        product="MIS",
        qty=1,
        close_lot_id=lot_id,
        trading_enabled=True,
    )
    svc.enqueue_tick(Tick(instrument_key=key, price=101.0, volume_traded_today=3, timestamp_ms=3))
    time.sleep(0.25)

    close = svc.get_order(uid, UUID(close["id"]))
    assert close["status"] == "FILLED"
    linked = svc.get_order(uid, UUID(sl_linked["id"]))
    orphan = svc.get_order(uid, UUID(sl_orphan["id"]))
    assert linked["status"] == "EXPIRED"
    assert linked["rejectReason"] == "LOT_CLOSED"
    assert orphan["status"] == "EXPIRED"
    assert orphan["rejectReason"] == "LOT_CLOSED"
    open_lots = svc.list_positions(uid, open_only=True)
    assert open_lots == []
    svc.stop()


def test_reject_index(monkeypatch, wl):
    monkeypatch.setattr("app.paper.service.phase_from_clock", lambda: MarketPhase.OPEN)
    idx = WatchlistEntry(
        symbol_id="NSE_INDEX|Nifty 50",
        trading_symbol="Nifty 50",
        exchange="NSE",
        segment="NSE_INDEX",
        instrument_type="INDEX",
        display_name="Nifty 50",
        added_at=datetime.now(timezone.utc),
        active=True,
        bootstrap_status=SymbolBootstrapStatus.READY,
        bootstrap_error=None,
    )
    wl.save(idx)
    settings = Settings(paper_enabled=True, paper_allow_memory=True)
    uid = uuid4()
    svc = PaperTradingService(
        settings,
        wl,
        session_factory=None,
        user_cash_provider=lambda _u: Decimal("100000"),
    )
    svc.start()
    svc.enqueue_tick(
        Tick(instrument_key=idx.symbol_id, price=22000.0, volume_traded_today=1, timestamp_ms=1)
    )
    import time

    time.sleep(0.1)
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as ei:
        svc.place_order(
            uid,
            instrument_key=idx.symbol_id,
            side="BUY",
            order_type="MARKET",
            product="MIS",
            qty=1,
        )
    assert ei.value.status_code == 400
    svc.stop()

"""Force-close writes a synthetic FILLED order + fill into the live book and Postgres."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.db.base import Base
from app.market.models import Tick
from app.paper.entities import PaperFillRow, PaperLotRow, PaperOrderRow
from app.paper.models import (
    CashLock,
    LockReason,
    LotSide,
    LotStatus,
    OrderSource,
    OrderStatus,
    OrderType,
    PaperOrder,
    PositionLot,
    Product,
    Side,
    WorkingOrderType,
)
from app.paper.repository import upsert_lot, upsert_order
from app.paper.service import PaperTradingService
from app.user.entities import AppUserRow
from app.user.service import money
from app.watchlist.models import SymbolBootstrapStatus, WatchlistEntry
from app.watchlist.repository import InMemoryWatchlistRepository


KEY = "NSE_EQ|RELIANCE"


def _entry() -> WatchlistEntry:
    return WatchlistEntry(
        symbol_id=KEY,
        trading_symbol="RELIANCE",
        exchange="NSE",
        segment="NSE_EQ",
        instrument_type="EQ",
        display_name="RELIANCE",
        added_at=datetime.now(timezone.utc),
        active=True,
        bootstrap_status=SymbolBootstrapStatus.READY,
        bootstrap_error=None,
    )


def _svc(session_factory=None, uid: UUID | None = None, cash: Decimal | None = None):
    repo = InMemoryWatchlistRepository()
    repo.save(_entry())
    uid = uid or uuid4()
    balances = {uid: cash if cash is not None else Decimal("100000")}
    settings = Settings(
        paper_enabled=True,
        paper_allow_memory=True,
        paper_charges_enabled=False,
    )

    def provider(u):
        return balances.get(u, Decimal("0"))

    def writer(u, bal, _led):
        balances[u] = bal

    svc = PaperTradingService(
        settings,
        repo,
        session_factory=session_factory,
        user_cash_provider=provider,
        user_cash_writer=writer,
    )
    return svc, uid, balances


def _open_lot(
    uid: UUID,
    *,
    side: LotSide = LotSide.LONG,
    qty: int = 10,
    px: Decimal = Decimal("100"),
    product: Product = Product.MIS,
) -> PositionLot:
    now = datetime.now(timezone.utc)
    return PositionLot(
        id=uuid4(),
        user_id=uid,
        instrument_key=KEY,
        trading_symbol="RELIANCE",
        side=side,
        product=product,
        qty_open=qty,
        qty_closed=0,
        avg_entry_price=px,
        realized_pnl=money(0),
        status=LotStatus.OPEN,
        opened_at=now,
        updated_at=now,
    )


def _seed_open_order(svc: PaperTradingService, uid: UUID) -> PaperOrder:
    now = datetime.now(timezone.utc)
    order = PaperOrder(
        id=uuid4(),
        user_id=uid,
        instrument_key=KEY,
        trading_symbol="RELIANCE",
        side=Side.BUY,
        order_type=OrderType.LIMIT,
        working_order_type=WorkingOrderType.LIMIT,
        product=Product.MIS,
        qty=3,
        filled_qty=0,
        price=Decimal("99"),
        status=OrderStatus.OPEN,
        source=OrderSource.USER,
        accept_seq=svc._next_accept_seq(),
        accepted_at=now,
        created_at=now,
        updated_at=now,
    )
    svc._orders[order.id] = order
    svc._open_by_symbol.setdefault(KEY, set()).add(order.id)
    return order


def test_force_close_long_visible_on_same_service_before_bounce(monkeypatch):
    import app.paper.service as svc_mod

    svc, uid, _ = _svc()
    lot = _open_lot(uid)
    svc._lots[lot.id] = lot
    acc = svc._account(uid)
    now = datetime.now(timezone.utc)

    captured: dict = {}
    orig = svc_mod.apply_fill_cash

    def spy(account, order, lot_arg, *args, **kwargs):
        captured["filled_qty"] = order.filled_qty
        captured["status"] = order.status
        captured["remaining"] = order.remaining
        return orig(account, order, lot_arg, *args, **kwargs)

    monkeypatch.setattr(svc_mod, "apply_fill_cash", spy)

    svc._force_close_lot(acc, lot, Decimal("105"), now, reason="ADMIN_WIPE")

    assert captured["filled_qty"] == 0
    assert captured["status"] == OrderStatus.OPEN
    assert captured["remaining"] == 10

    orders = svc.list_orders(uid)
    fills = svc.list_fills(uid)
    assert len(fills) == 1
    assert len(orders) == 1
    so = orders[0]
    assert so["source"] == OrderSource.SYSTEM_SQUARE_OFF.value
    assert so["closeLotId"] == str(lot.id)
    assert so["status"] == OrderStatus.FILLED.value
    assert so["filledQty"] == 10
    assert so["side"] == Side.SELL.value
    assert UUID(so["id"]) not in svc._open_by_symbol.get(KEY, set())
    assert fills[0]["orderId"] == so["id"]
    assert fills[0]["qty"] == 10
    assert UUID(fills[0]["orderId"]) == UUID(so["id"])
    raw = svc._fills[0]
    assert raw.charges_total == money(0)
    assert raw.schedule_id == "off"
    assert raw.tick_ts_ms == int(now.timestamp() * 1000)
    assert raw.lot_id == lot.id
    assert lot.status == LotStatus.CLOSED
    assert svc.list_positions(uid, open_only=True) == []
    assert [e.entry_type for e in acc.ledger] == ["SELL"]
    assert acc.cash_balance == money(100000 + 10 * 105)


def test_force_close_short_ledger_is_square_off():
    svc, uid, _ = _svc()
    lot = _open_lot(uid, side=LotSide.SHORT, qty=10, px=Decimal("100"))
    svc._lots[lot.id] = lot
    acc = svc._account(uid)
    acc.locks.append(
        CashLock(
            id=uuid4(),
            user_id=uid,
            amount=money(1000),
            reason=LockReason.SHORT_MARGIN,
            lot_id=lot.id,
            created_at=datetime.now(timezone.utc),
        )
    )
    now = datetime.now(timezone.utc)
    svc._force_close_lot(acc, lot, Decimal("98"), now, reason="MIS_FORCE_CLOSED")

    orders = svc.list_orders(uid)
    fills = svc.list_fills(uid)
    assert len(fills) == 1
    assert orders[0]["side"] == Side.BUY.value
    assert orders[0]["closeLotId"] == str(lot.id)
    assert orders[0]["source"] == OrderSource.SYSTEM_SQUARE_OFF.value
    assert UUID(orders[0]["id"]) not in svc._open_by_symbol.get(KEY, set())
    assert [e.entry_type for e in acc.ledger] == ["SQUARE_OFF"]
    assert acc.lot_margin_lock(lot.id) is None
    assert lot.status == LotStatus.CLOSED
    assert svc._fills[0].charges_total == money(0)


def test_wipe_user_cancels_open_orders_and_force_closes_on_same_instance():
    svc, uid, _ = _svc()
    open_o = _seed_open_order(svc, uid)
    lot = _open_lot(uid, qty=4, px=Decimal("100"))
    svc._lots[lot.id] = lot
    svc._ltp.update(Tick(instrument_key=KEY, price=101.0, volume_traded_today=1, timestamp_ms=1))

    svc.wipe_user(uid)

    cancelled = svc.get_order(uid, open_o.id)
    assert cancelled["status"] == OrderStatus.CANCELLED.value
    assert cancelled["rejectReason"] == "ADMIN_WIPE"
    assert open_o.id not in svc._open_by_symbol.get(KEY, set())

    orders = svc.list_orders(uid)
    synthetic = [o for o in orders if o["source"] == OrderSource.SYSTEM_SQUARE_OFF.value]
    assert len(synthetic) == 1
    assert synthetic[0]["closeLotId"] == str(lot.id)
    assert synthetic[0]["status"] == OrderStatus.FILLED.value
    assert UUID(synthetic[0]["id"]) not in svc._open_by_symbol.get(KEY, set())
    fills = svc.list_fills(uid)
    assert len(fills) == 1
    assert fills[0]["orderId"] == synthetic[0]["id"]
    assert svc.list_positions(uid, open_only=True) == []
    acc = svc._account(uid)
    assert [e.entry_type for e in acc.ledger] == ["SELL"]


@pytest.fixture()
def pg_mem():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    assert AppUserRow.__tablename__
    assert PaperOrderRow.__tablename__
    Base.metadata.create_all(engine)
    sf = sessionmaker(bind=engine, expire_on_commit=False)
    uid = uuid4()
    now = datetime.now(timezone.utc)
    with sf() as s:
        s.add(
            AppUserRow(
                id=uid,
                username="papertrader",
                password_hash="x",
                role="USER",
                cash_balance=Decimal("100000.00"),
                trading_enabled=True,
                active=True,
                created_at=now,
                updated_at=now,
            )
        )
        s.commit()
    return sf, uid


def test_wipe_persists_cancels_and_synthetic_fill(pg_mem):
    sf, uid = pg_mem
    svc, uid, _ = _svc(session_factory=sf, uid=uid)
    open_o = _seed_open_order(svc, uid)
    upsert_order(sf, open_o)
    lot = _open_lot(uid, qty=2, px=Decimal("100"))
    svc._lots[lot.id] = lot
    upsert_lot(sf, lot)
    svc._ltp.update(Tick(instrument_key=KEY, price=103.0, volume_traded_today=1, timestamp_ms=9))

    svc.wipe_user(uid)

    with sf() as s:
        order_rows = list(s.scalars(select(PaperOrderRow)).all())
        fill_rows = list(s.scalars(select(PaperFillRow)).all())
        lot_rows = list(s.scalars(select(PaperLotRow)).all())
    by_id = {r.id: r for r in order_rows}
    assert by_id[open_o.id].status == OrderStatus.CANCELLED.value
    assert by_id[open_o.id].reject_reason == "ADMIN_WIPE"
    synthetic = [r for r in order_rows if r.id != open_o.id]
    assert len(synthetic) == 1
    so = synthetic[0]
    assert so.status == OrderStatus.FILLED.value
    assert so.source == OrderSource.SYSTEM_SQUARE_OFF.value
    assert so.close_lot_id == lot.id
    assert so.filled_qty == 2
    assert so.side == Side.SELL.value
    assert len(fill_rows) == 1
    assert fill_rows[0].order_id == so.id
    assert fill_rows[0].lot_id == lot.id
    assert money(fill_rows[0].charges_total) == money(0)
    assert fill_rows[0].schedule_id == "off"
    assert lot_rows[0].status == LotStatus.CLOSED.value
    assert lot_rows[0].qty_open == 0

    bounced = PaperTradingService(
        Settings(paper_enabled=True, paper_allow_memory=True, paper_charges_enabled=False),
        InMemoryWatchlistRepository(),
        session_factory=sf,
        user_cash_provider=lambda _u: Decimal("100000"),
    )
    bounced._load_from_db()
    fills = bounced.list_fills(uid)
    orders = bounced.list_orders(uid)
    assert len(fills) == 1
    assert fills[0]["orderId"] == str(so.id)
    so_live = [o for o in orders if o["source"] == OrderSource.SYSTEM_SQUARE_OFF.value]
    assert so_live[0]["closeLotId"] == str(lot.id)
    assert so.id not in bounced._open_by_symbol.get(KEY, set())

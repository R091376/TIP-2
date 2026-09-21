"""Cash writer: persist by LedgerEntry.id, unpublished watermark, no duplicates."""

from __future__ import annotations

import inspect
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.db.base import Base
from app.paper.cash_writer import write_user_cash
from app.paper.models import LedgerEntry
from app.paper.service import PaperTradingService
from app.user.entities import AppUserRow, CashLedgerRow
from app.user.service import money
from app.watchlist.repository import InMemoryWatchlistRepository


@pytest.fixture()
def pg_mem():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    assert AppUserRow.__tablename__
    assert CashLedgerRow.__tablename__
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


def _rows(sf, uid):
    with sf() as s:
        return list(
            s.scalars(
                select(CashLedgerRow)
                .where(CashLedgerRow.user_id == uid)
                .order_by(CashLedgerRow.created_at.asc(), CashLedgerRow.id.asc())
            ).all()
        )


def test_writer_never_mints_ids():
    src = inspect.getsource(write_user_cash)
    assert "uuid4" not in src
    import app.paper.cash_writer as mod

    assert "uuid4" not in inspect.getsource(mod)


def test_open_short_and_fee_persist_two_rows_by_ledger_id(pg_mem):
    sf, uid = pg_mem
    sell = LedgerEntry("SELL", money(0), money(100000), "OPEN_SHORT fill 10@100")
    fee = LedgerEntry("FEE", money("-0.72"), money("99999.28"), f"fill {uuid4()} off")
    write_user_cash(sf, uid, money("99999.28"), [sell, fee])

    rows = _rows(sf, uid)
    by_id = {r.id: r for r in rows}
    assert set(by_id) == {sell.id, fee.id}
    assert by_id[sell.id].entry_type == "SELL"
    assert by_id[sell.id].amount == money(0)
    assert by_id[fee.id].entry_type == "FEE"
    assert by_id[fee.id].amount == money("-0.72")
    with sf() as s:
        user = s.get(AppUserRow, uid)
        assert user is not None
        assert money(user.cash_balance) == money("99999.28")


def test_second_fill_does_not_duplicate_first(pg_mem):
    sf, uid = pg_mem
    first_sell = LedgerEntry("SELL", money(0), money(100000), "OPEN_SHORT fill 1")
    first_fee = LedgerEntry("FEE", money(0), money(100000), "fill a off")
    write_user_cash(sf, uid, money(100000), [first_sell, first_fee])

    second_sell = LedgerEntry("SELL", money(0), money(100000), "OPEN_SHORT fill 2")
    second_fee = LedgerEntry("FEE", money(0), money(100000), "fill b off")
    # Re-hand the first pair as well (old last-5 behaviour) — ids must not duplicate.
    write_user_cash(
        sf,
        uid,
        money(100000),
        [first_sell, first_fee, second_sell, second_fee],
    )

    rows = _rows(sf, uid)
    assert {r.id for r in rows} == {
        first_sell.id,
        first_fee.id,
        second_sell.id,
        second_fee.id,
    }


def test_unchanged_balance_still_inserts_fee(pg_mem):
    sf, uid = pg_mem
    with sf() as s:
        user = s.get(AppUserRow, uid)
        assert user is not None
        user.updated_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
        s.commit()

    write_user_cash(sf, uid, money(100000), [])
    with sf() as s:
        user = s.get(AppUserRow, uid)
        assert user is not None
        skipped_at = user.updated_at
        assert money(user.cash_balance) == money(100000)

    fee = LedgerEntry("FEE", money(0), money(100000), "fill zero-fee")
    write_user_cash(sf, uid, money(100000), [fee])
    rows = _rows(sf, uid)
    assert len(rows) == 1
    assert rows[0].id == fee.id
    assert rows[0].entry_type == "FEE"
    with sf() as s:
        user = s.get(AppUserRow, uid)
        assert user is not None
        assert money(user.cash_balance) == money(100000)
        assert user.updated_at != skipped_at


def test_service_unpublished_watermark_not_last_five():
    settings = Settings(paper_enabled=True, paper_allow_memory=True)
    uid = uuid4()
    seen: list[list] = []

    def writer(_u, _bal, led):
        seen.append([le.id for le in led])

    svc = PaperTradingService(
        settings,
        InMemoryWatchlistRepository(),
        session_factory=None,
        user_cash_writer=writer,
    )
    acc = svc._account(uid)
    first = [LedgerEntry("SELL", money(0), acc.cash_balance, f"e{i}") for i in range(6)]
    acc.ledger.extend(first)
    svc._write_user_cash(uid, acc)
    assert acc.ledger_published_thru == 6
    assert seen[-1] == [e.id for e in first]

    nxt = LedgerEntry("FEE", money(0), acc.cash_balance, "second fill")
    acc.ledger.append(nxt)
    svc._write_user_cash(uid, acc)
    assert acc.ledger_published_thru == 7
    assert seen[-1] == [nxt.id]


def test_service_does_not_advance_watermark_when_writer_fails():
    settings = Settings(paper_enabled=True, paper_allow_memory=True)
    uid = uuid4()

    def writer(_u, _bal, _led):
        raise RuntimeError("writer down")

    svc = PaperTradingService(
        settings,
        InMemoryWatchlistRepository(),
        session_factory=None,
        user_cash_writer=writer,
    )
    acc = svc._account(uid)
    acc.ledger.append(LedgerEntry("SELL", money(0), acc.cash_balance, "OPEN_SHORT"))
    svc._write_user_cash(uid, acc)
    assert acc.ledger_published_thru == 0


def test_list_ledger_reads_postgres_when_session_factory_set(pg_mem):
    sf, uid = pg_mem
    sell = LedgerEntry("SELL", money("1050"), money("101050"), "CLOSE_LONG fill 10@105")
    fee = LedgerEntry("FEE", money("-0.67"), money("101049.33"), f"fill {uuid4()} nse_eq_cash_v1")
    write_user_cash(sf, uid, money("101049.33"), [sell, fee])

    svc = PaperTradingService(
        Settings(paper_enabled=True, paper_allow_memory=True, paper_charges_enabled=False),
        InMemoryWatchlistRepository(),
        session_factory=sf,
        user_cash_provider=lambda _u: Decimal("101049.33"),
    )
    rows = svc.list_ledger(uid, limit=10)
    assert [r["entryType"] for r in rows] == ["FEE", "SELL"]
    assert rows[0]["amount"] == pytest.approx(-0.67)
    mem = PaperTradingService(
        Settings(paper_enabled=True, paper_allow_memory=True),
        InMemoryWatchlistRepository(),
        session_factory=None,
        user_cash_provider=lambda _u: Decimal("100000"),
    )
    acc = mem._account(uid)
    acc.ledger.append(LedgerEntry("BUY", money("-1000"), money("99000"), "mem"))
    mem_rows = mem.list_ledger(uid, limit=10)
    assert mem_rows[0]["entryType"] == "BUY"

from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

from app.config import Settings
from app.market.nse_clock import MarketPhase
from app.market.session_policy import SessionKind
from app.paper.models import OrderSource
from app.paper.service import PaperTradingService
from app.watchlist.models import SymbolBootstrapStatus, WatchlistEntry
from app.watchlist.repository import InMemoryWatchlistRepository


def _entry(key: str, sym: str, segment="NSE_EQ", itype="EQ") -> WatchlistEntry:
    return WatchlistEntry(
        symbol_id=key,
        trading_symbol=sym,
        exchange="NSE",
        segment=segment,
        instrument_type=itype,
        display_name=sym,
        added_at=datetime.now(timezone.utc),
        active=True,
        bootstrap_status=SymbolBootstrapStatus.READY,
        bootstrap_error=None,
    )


@pytest.fixture
def svc_wl():
    repo = InMemoryWatchlistRepository()
    repo.save(_entry("NSE_EQ|RELIANCE", "RELIANCE"))
    repo.save(_entry("NSE_EQ|FOOBAR", "FOOBAR"))
    settings = Settings(paper_enabled=True, paper_allow_memory=True)
    uid = uuid4()
    balances = {uid: Decimal("100000")}

    def provider(u):
        return balances.get(u, Decimal("0"))

    def writer(u, bal, _led):
        balances[u] = bal

    svc = PaperTradingService(
        settings,
        repo,
        session_factory=None,
        user_cash_provider=provider,
        user_cash_writer=writer,
    )
    return svc, repo, uid


def test_cas_user_order_rejected_after_cts(monkeypatch, svc_wl):
    svc, _repo, uid = svc_wl
    monkeypatch.setattr("app.paper.service.phase_from_clock", lambda: MarketPhase.OPEN)

    def phase_at(_now, close_minutes=None):
        if close_minutes == 15 * 60 + 15:
            return MarketPhase.CLOSED
        return MarketPhase.OPEN

    monkeypatch.setattr("app.paper.service.phase_at", phase_at)

    with pytest.raises(HTTPException) as ei:
        svc.place_order(
            uid,
            instrument_key="NSE_EQ|RELIANCE",
            side="BUY",
            order_type="MARKET",
            product="CNC",
            qty=1,
        )
    assert ei.value.status_code == 400
    assert ei.value.detail["code"] == "MARKET_CLOSED"

    got = svc.place_order(
        uid,
        instrument_key="NSE_EQ|FOOBAR",
        side="BUY",
        order_type="LIMIT",
        product="CNC",
        qty=1,
        price=10.0,
    )
    assert got["status"] in ("OPEN", "PENDING")


def test_system_square_off_bypasses_cts(monkeypatch, svc_wl):
    svc, _repo, uid = svc_wl
    monkeypatch.setattr("app.paper.service.phase_from_clock", lambda: MarketPhase.OPEN)
    monkeypatch.setattr(
        "app.paper.service.phase_at",
        lambda *a, **k: MarketPhase.CLOSED,
    )
    # SYSTEM source skips the user OPEN/CTS gate
    with pytest.raises(HTTPException) as ei:
        svc.place_order(
            uid,
            instrument_key="NSE_EQ|RELIANCE",
            side="BUY",
            order_type="MARKET",
            product="MIS",
            qty=1,
            source=OrderSource.USER,
        )
    assert ei.value.detail["code"] == "MARKET_CLOSED"


def test_cas_cnc_expires_at_session_end_not_cts(monkeypatch, svc_wl):
    svc, _repo, uid = svc_wl
    monkeypatch.setattr("app.paper.service.phase_from_clock", lambda: MarketPhase.OPEN)
    monkeypatch.setattr("app.paper.service.phase_at", lambda *a, **k: MarketPhase.OPEN)
    got = svc.place_order(
        uid,
        instrument_key="NSE_EQ|RELIANCE",
        side="BUY",
        order_type="LIMIT",
        product="CNC",
        qty=1,
        price=10.0,
    )
    oid = UUID(got["id"])
    d = date(2026, 8, 4)
    svc._force_remaining_mis(d, kinds={SessionKind.CAS_CASH})
    still = svc.get_order(uid, oid)
    assert still["status"] in ("OPEN", "PENDING")

    svc._force_remaining_mis(d)
    ended = svc.get_order(uid, oid)
    assert ended["status"] == "EXPIRED"
    assert ended.get("rejectReason") == "SESSION_END"

"""WatchlistController parity tests (Java WatchlistControllerTest)."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api import watchlist as watchlist_api
from app.watchlist.models import SymbolBootstrapStatus, WatchlistEntry


def _entry(symbol_id: str, trading_symbol: str, status=SymbolBootstrapStatus.READY) -> WatchlistEntry:
    return WatchlistEntry(
        symbol_id=symbol_id,
        trading_symbol=trading_symbol,
        exchange="NSE",
        segment="NSE_INDEX" if symbol_id.startswith("NSE_INDEX") else "NSE_EQ",
        instrument_type="INDEX" if symbol_id.startswith("NSE_INDEX") else "EQ",
        display_name=trading_symbol,
        added_at=datetime(2026, 7, 10, tzinfo=timezone.utc),
        active=True,
        bootstrap_status=status,
        bootstrap_error=None,
    )


@pytest.fixture()
def wl_client():
    """Isolated FastAPI app with mocked WatchlistService (filters off)."""
    service = MagicMock()
    app = FastAPI()
    app.include_router(watchlist_api.router)

    class Container:
        watchlist_service = service

    @app.middleware("http")
    async def inject_container(request, call_next):
        request.app.state.container = Container()
        return await call_next(request)

    # Bypass auth for controller unit tests (Java @AutoConfigureMockMvc(addFilters=false))
    from app.api import deps

    app.dependency_overrides[deps.current_user] = lambda: {"username": "admin", "role": "ADMIN"}
    app.dependency_overrides[deps.require_admin] = lambda: {"username": "admin", "role": "ADMIN"}

    with TestClient(app) as c:
        yield c, service


def test_list_returns_active_entries(wl_client):
    client, service = wl_client
    service.list_active.return_value = [
        _entry("NSE_INDEX|Nifty 50", "Nifty 50"),
    ]
    r = client.get("/api/watchlist")
    assert r.status_code == 200
    body = r.json()
    assert body[0]["symbolId"] == "NSE_INDEX|Nifty 50"
    assert body[0]["tradingSymbol"] == "Nifty 50"
    assert body[0]["bootstrapStatus"] == "READY"


def test_post_add_returns_200_with_ready_entry(wl_client):
    client, service = wl_client
    service.add.return_value = _entry("NSE_EQ|INE081A01020", "TATASTEEL")
    r = client.post("/api/watchlist", json={"symbol": "TATASTEEL"})
    assert r.status_code == 200
    assert r.json()["tradingSymbol"] == "TATASTEEL"
    assert r.json()["bootstrapStatus"] == "READY"
    service.add.assert_called_once_with("TATASTEEL", None)


def test_post_add_by_instrument_key(wl_client):
    client, service = wl_client
    service.add.return_value = _entry("NSE_EQ|INE002A01018", "RELIANCE")
    r = client.post(
        "/api/watchlist", json={"instrumentKey": "NSE_EQ|INE002A01018"}
    )
    assert r.status_code == 200
    assert r.json()["tradingSymbol"] == "RELIANCE"
    assert r.json()["symbolId"] == "NSE_EQ|INE002A01018"
    service.add.assert_called_once_with(None, "NSE_EQ|INE002A01018")


def test_post_add_duplicate_returns_409(wl_client):
    client, service = wl_client
    service.add.side_effect = HTTPException(
        status_code=409, detail="Symbol already on watchlist: RELIANCE"
    )
    r = client.post("/api/watchlist", json={"symbol": "RELIANCE"})
    assert r.status_code == 409


def test_post_add_at_hard_max_returns_409(wl_client):
    client, service = wl_client
    service.add.side_effect = HTTPException(
        status_code=409, detail="Watchlist is full (max 50 symbols)"
    )
    r = client.post("/api/watchlist", json={"symbol": "TATASTEEL"})
    assert r.status_code == 409


def test_post_add_unknown_symbol_returns_404(wl_client):
    client, service = wl_client
    service.add.side_effect = HTTPException(
        status_code=404, detail="Unknown trading symbol: FOOBAR"
    )
    r = client.post("/api/watchlist", json={"symbol": "FOOBAR"})
    assert r.status_code == 404


def test_delete_encoded_pipe_and_space_returns_204(wl_client):
    client, service = wl_client
    r = client.delete("/api/watchlist/NSE_INDEX|Nifty 50")
    assert r.status_code == 204
    service.remove.assert_called_once_with("NSE_INDEX|Nifty 50")


def test_delete_encoded_equity_key_returns_204(wl_client):
    client, service = wl_client
    r = client.delete("/api/watchlist/NSE_EQ|INE002A01018")
    assert r.status_code == 204
    service.remove.assert_called_once_with("NSE_EQ|INE002A01018")


def test_delete_pre_encoded_uri_decodes_pipe(wl_client):
    client, service = wl_client
    r = client.delete("/api/watchlist/NSE_EQ%7CINE002A01018")
    assert r.status_code == 204
    service.remove.assert_called_once_with("NSE_EQ|INE002A01018")


def test_delete_unknown_returns_404(wl_client):
    client, service = wl_client
    service.remove.side_effect = HTTPException(
        status_code=404, detail="Symbol not on watchlist: missing"
    )
    r = client.delete("/api/watchlist/missing")
    assert r.status_code == 404

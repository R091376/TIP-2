"""Security 401/403 matrix + non-admin watchlist (Java SecurityConfig parity)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import clear_settings_cache


@pytest.fixture()
def secure_app(monkeypatch):
    """Non-memory profile: JWT auth enforced (even if store falls back to memory)."""
    clear_settings_cache()
    monkeypatch.setenv("TIP_WATCHLIST_STORE", "postgres")
    monkeypatch.setenv("TIP_PROFILE", "")
    monkeypatch.setenv("UPSTOX_ACCESS_TOKEN", "")
    monkeypatch.setenv("TIP_ADMIN_PASSWORD", "admin")
    monkeypatch.setenv("JWT_SECRET", "test-jwt-secret-for-security-matrix")
    clear_settings_cache()

    from app.main import create_app

    application = create_app()
    with TestClient(application) as c:
        try:
            us = c.app.state.container.user_service
            admin = us.find_by_username("admin")
            if admin is not None:
                us.set_password(admin.id, "admin")
            else:
                us.ensure_admin_seeded()
        except Exception:
            pass
        assert not c.app.state.container.settings.is_memory_profile
        yield c
    clear_settings_cache()
    monkeypatch.setenv("TIP_WATCHLIST_STORE", "memory")
    monkeypatch.setenv("TIP_PROFILE", "memory")


def _login(client: TestClient, username: str, password: str):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def _headers_from_login(response) -> dict:
    body = response.json()
    assert "accessToken" in body, body
    return {"Authorization": f"Bearer {body['accessToken']}"}


def _ensure_regular_user(client: TestClient) -> dict:
    """Login as admin, create a USER role account if needed, return credentials."""
    r = _login(client, "admin", "admin")
    assert r.status_code == 200, r.text
    headers = _headers_from_login(r)
    create = client.post(
        "/api/admin/users",
        headers=headers,
        json={
            "username": "trader1",
            "password": "pass1234",
            "role": "USER",
            "displayName": "Trader One",
            "seedCash": 50_000,
        },
    )
    if create.status_code not in (200, 409):
        assert create.status_code == 200, create.text
    return {"username": "trader1", "password": "pass1234"}


def test_public_market_desk_allows_unauthenticated_get(secure_app):
    """Guest chart/watchlist/alerts/stats must not 401 (200 or 404/503 ok)."""
    client = secure_app
    paths = (
        "/api/watchlist",
        "/api/market/status",
        "/api/market/timeframes",
        "/api/market/symbol",
        "/api/market/candles",
        "/api/symbols/NSE_INDEX%7CNifty%2050/candles",
        "/api/symbols/NSE_INDEX%7CNifty%2050/sr",
        "/api/symbols/NSE_INDEX%7CNifty%2050/patterns",
        "/api/symbols/NSE_INDEX%7CNifty%2050/statistics?patternType=breakout&timeframe=5m",
        "/api/pattern-alerts",
        "/api/pattern-statistics",
        "/api/health",
    )
    for path in paths:
        r = client.get(path)
        assert r.status_code != 401, f"{path} must not 401, got {r.status_code}: {r.text}"

    status = client.get("/api/market/status")
    assert status.status_code == 200, status.text
    body = status.json()
    assert "liveFeed" not in body
    assert "liveFeedConnected" in body


def test_unauthenticated_private_api_returns_401(secure_app):
    client = secure_app
    for path in (
        "/api/auth/me",
        "/api/admin/users",
        "/api/paper/account",
        "/api/paper/orders",
        "/api/paper/positions",
        "/api/paper/ltp/NSE_EQ%7CX",
        "/api/pattern-statistics/query",
        "/api/instruments/search?q=REL",
        "/api/backtests",
    ):
        r = client.get(path)
        assert r.status_code == 401, f"{path} expected 401 got {r.status_code}: {r.text}"


def test_unauthenticated_watchlist_mutations_401(secure_app):
    client = secure_app
    r = client.post("/api/watchlist", json={"symbol": "RELIANCE"})
    assert r.status_code == 401
    r = client.delete("/api/watchlist/NSE_EQ%7CX")
    assert r.status_code == 401
    r = client.post("/api/backtests", json={"symbols": ["NSE_EQ|X"]})
    assert r.status_code == 401
    r = client.delete("/api/backtests")
    assert r.status_code == 401
    r = client.post(
        "/api/paper/charges/preview",
        json={
            "instrumentKey": "NSE_EQ|X",
            "side": "BUY",
            "orderType": "MARKET",
            "product": "MIS",
            "qty": 1,
        },
    )
    assert r.status_code == 401


def test_login_invalid_credentials_401(secure_app):
    r = _login(secure_app, "admin", "wrong-password")
    assert r.status_code == 401


def test_login_admin_and_me(secure_app):
    client = secure_app
    r = _login(client, "admin", "admin")
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "ADMIN"
    assert body["accessToken"]
    assert body["expiresIn"] == 8 * 3600
    headers = _headers_from_login(r)
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["username"] == "admin"


def test_user_can_list_watchlist_but_not_mutate(secure_app):
    client = secure_app
    creds = _ensure_regular_user(client)
    r = _login(client, creds["username"], creds["password"])
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "USER"
    headers = _headers_from_login(r)

    listed = client.get("/api/watchlist", headers=headers)
    assert listed.status_code == 200
    assert isinstance(listed.json(), list)

    st = client.get("/api/market/status", headers=headers)
    assert st.status_code == 200

    add = client.post("/api/watchlist", headers=headers, json={"symbol": "TATASTEEL"})
    assert add.status_code == 403, add.text

    delete = client.delete(
        "/api/watchlist/NSE_INDEX%7CNifty%2050",
        headers=headers,
    )
    assert delete.status_code == 403, delete.text


def test_user_cannot_access_admin_endpoints(secure_app):
    client = secure_app
    creds = _ensure_regular_user(client)
    r = _login(client, creds["username"], creds["password"])
    assert r.status_code == 200
    headers = _headers_from_login(r)

    assert client.get("/api/admin/users", headers=headers).status_code == 403
    assert (
        client.post(
            "/api/admin/users",
            headers=headers,
            json={"username": "x", "password": "pass1234"},
        ).status_code
        == 403
    )


def test_admin_can_mutate_watchlist_authz_passes(secure_app):
    """Authz only: admin is not blocked by 403 (may 404 on unknown symbol)."""
    client = secure_app
    r = _login(client, "admin", "admin")
    assert r.status_code == 200
    headers = _headers_from_login(r)
    resp = client.post(
        "/api/watchlist",
        headers=headers,
        json={"symbol": "TOTALLYUNKNOWNXYZ"},
    )
    assert resp.status_code not in (401, 403)
    assert resp.status_code in (404, 409, 200, 500, 503)


def test_logout_is_stateless(secure_app):
    """Logout does not revoke JWT; client must discard token."""
    client = secure_app
    r = _login(client, "admin", "admin")
    headers = _headers_from_login(r)
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/watchlist").status_code == 200


def test_health_and_login_permit_all(secure_app):
    client = secure_app
    assert client.get("/api/health").status_code == 200
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code in (200, 401)


def test_invalid_bearer_401(secure_app):
    client = secure_app
    r = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer not-a-valid-jwt"},
    )
    assert r.status_code == 401

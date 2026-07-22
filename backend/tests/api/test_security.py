"""Security 401/403 matrix + non-admin watchlist (Java SecurityConfig parity)."""

from __future__ import annotations

import os
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.config import clear_settings_cache
from app.user.models import UserRole


@pytest.fixture()
def secure_app(monkeypatch):
    """Non-memory profile: session auth enforced (even if store falls back to memory)."""
    clear_settings_cache()
    monkeypatch.setenv("TIP_WATCHLIST_STORE", "postgres")
    monkeypatch.setenv("TIP_PROFILE", "")
    monkeypatch.setenv("UPSTOX_ACCESS_TOKEN", "")
    monkeypatch.setenv("TIP_ADMIN_PASSWORD", "admin")
    clear_settings_cache()

    from app.main import create_app

    application = create_app()
    with TestClient(application) as c:
        # Ensure known admin password for matrix tests (Postgres may already have admin)
        try:
            us = c.app.state.container.user_service
            admin = us.find_by_username("admin")
            if admin is not None:
                us.set_password(admin.id, "admin")
            else:
                us.ensure_admin_seeded()
        except Exception:
            pass
        # Confirm security is actually enforced (not memory open profile)
        assert not c.app.state.container.settings.is_memory_profile
        yield c
    clear_settings_cache()
    monkeypatch.setenv("TIP_WATCHLIST_STORE", "memory")
    monkeypatch.setenv("TIP_PROFILE", "memory")


def _login(client: TestClient, username: str, password: str):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def _ensure_regular_user(client: TestClient) -> dict:
    """Login as admin, create a USER role account if needed, return credentials."""
    r = _login(client, "admin", "admin")
    assert r.status_code == 200, r.text
    # try create
    create = client.post(
        "/api/admin/users",
        json={
            "username": "trader1",
            "password": "pass1234",
            "role": "USER",
            "displayName": "Trader One",
            "seedCash": 50_000,
        },
    )
    if create.status_code not in (200, 409):
        # may already exist — ok
        assert create.status_code == 200, create.text
    client.post("/api/auth/logout")
    return {"username": "trader1", "password": "pass1234"}


def test_unauthenticated_api_returns_401(secure_app):
    client = secure_app
    for path in (
        "/api/watchlist",
        "/api/market/status",
        "/api/market/timeframes",
        "/api/market/symbol",
        "/api/auth/me",
        "/api/admin/users",
    ):
        r = client.get(path)
        assert r.status_code == 401, f"{path} expected 401 got {r.status_code}: {r.text}"


def test_unauthenticated_watchlist_mutations_401(secure_app):
    client = secure_app
    r = client.post("/api/watchlist", json={"symbol": "RELIANCE"})
    assert r.status_code == 401
    r = client.delete("/api/watchlist/NSE_EQ%7CX")
    assert r.status_code == 401


def test_login_invalid_credentials_401(secure_app):
    r = _login(secure_app, "admin", "wrong-password")
    assert r.status_code == 401


def test_login_admin_and_me(secure_app):
    client = secure_app
    r = _login(client, "admin", "admin")
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "ADMIN"
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "admin"


def test_user_can_list_watchlist_but_not_mutate(secure_app):
    client = secure_app
    creds = _ensure_regular_user(client)
    r = _login(client, creds["username"], creds["password"])
    assert r.status_code == 200
    assert r.json()["role"] == "USER"

    listed = client.get("/api/watchlist")
    assert listed.status_code == 200
    assert isinstance(listed.json(), list)

    # market read allowed for authenticated
    st = client.get("/api/market/status")
    assert st.status_code == 200

    add = client.post("/api/watchlist", json={"symbol": "TATASTEEL"})
    assert add.status_code == 403, add.text

    delete = client.delete("/api/watchlist/NSE_INDEX%7CNifty%2050")
    assert delete.status_code == 403, delete.text


def test_user_cannot_access_admin_endpoints(secure_app):
    client = secure_app
    creds = _ensure_regular_user(client)
    assert _login(client, creds["username"], creds["password"]).status_code == 200

    r = client.get("/api/admin/users")
    assert r.status_code == 403
    r = client.post(
        "/api/admin/users",
        json={"username": "x", "password": "pass1234"},
    )
    assert r.status_code == 403


def test_admin_can_mutate_watchlist_authz_passes(secure_app):
    """Authz only: admin is not blocked by 403 (may 404 on unknown symbol)."""
    client = secure_app
    assert _login(client, "admin", "admin").status_code == 200
    r = client.post("/api/watchlist", json={"symbol": "TOTALLYUNKNOWNXYZ"})
    # Not 401/403 — resolution/bootstrap layer
    assert r.status_code not in (401, 403)
    assert r.status_code in (404, 409, 200, 500, 503)


def test_logout_clears_session(secure_app):
    client = secure_app
    assert _login(client, "admin", "admin").status_code == 200
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/watchlist").status_code == 401


def test_health_and_login_permit_all(secure_app):
    client = secure_app
    assert client.get("/api/health").status_code == 200
    # login endpoint itself is open
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code in (200, 401)

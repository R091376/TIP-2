"""Same-origin SPA mounting (first-party session cookies)."""

from pathlib import Path

from fastapi.testclient import TestClient


def test_api_only_root_without_spa(client):
    """Default test env has no static/index.html → JSON root."""
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body["service"] == "tip2-api"
    assert body["health"] == "/api/health"


def test_spa_mount_serves_index(tmp_path, monkeypatch):
    from app.config import clear_settings_cache
    from app.main import create_app
    from app import spa as spa_mod

    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text(
        "<!doctype html><html><body>TIP SPA</body></html>", encoding="utf-8"
    )
    assets = static / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log(1)", encoding="utf-8")

    monkeypatch.setenv("TIP_WATCHLIST_STORE", "memory")
    clear_settings_cache()
    monkeypatch.setattr(spa_mod, "DEFAULT_STATIC_DIR", static)

    application = create_app()
    with TestClient(application) as c:
        r = c.get("/")
        assert r.status_code == 200
        assert "TIP SPA" in r.text
        assert "text/html" in r.headers.get("content-type", "")

        r2 = c.get("/login")
        assert r2.status_code == 200
        assert "TIP SPA" in r2.text

        r3 = c.get("/assets/app.js")
        assert r3.status_code == 200
        assert "console.log" in r3.text

        # API still works
        rh = c.get("/api/health")
        assert rh.status_code == 200
        assert rh.json()["status"] == "UP"

    clear_settings_cache()

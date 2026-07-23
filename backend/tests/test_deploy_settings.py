"""Deploy-related settings: CORS list + session cookie SameSite."""

import os

from app.config import Settings, clear_settings_cache, normalize_sqlalchemy_url


def test_normalize_sqlalchemy_url_neon_styles():
    assert normalize_sqlalchemy_url(
        "postgresql://u:p@host/db?sslmode=require"
    ).startswith("postgresql+psycopg://")
    assert normalize_sqlalchemy_url("postgres://u:p@host/db").startswith(
        "postgresql+psycopg://"
    )
    assert (
        normalize_sqlalchemy_url("postgresql+psycopg://u:p@host/db")
        == "postgresql+psycopg://u:p@host/db"
    )


def test_sqlalchemy_url_property_normalizes():
    clear_settings_cache()
    s = Settings(
        database_url="postgresql://neon:secret@ep-x.aws.neon.tech/neondb?sslmode=require",
        spring_datasource_url="",
    )
    assert s.sqlalchemy_url.startswith("postgresql+psycopg://")
    assert "ep-x.aws.neon.tech" in s.sqlalchemy_url
    clear_settings_cache()


def test_cors_origins_list_split():
    s = Settings(
        cors_allowed_origins="https://a.onrender.com, http://localhost:5173"
    )
    assert s.cors_origins_list() == [
        "https://a.onrender.com",
        "http://localhost:5173",
    ]


def test_session_same_site_none():
    s = Settings(session_cookie_samesite="none", session_cookie_https_only=True)
    assert s.session_same_site() == "none"
    assert s.session_cookie_https_only is True


def test_session_same_site_invalid_falls_back_to_lax():
    s = Settings(session_cookie_samesite="weird")
    assert s.session_same_site() == "lax"


def test_env_aliases_for_deploy(monkeypatch):
    clear_settings_cache()
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://fe.example")
    monkeypatch.setenv("SESSION_COOKIE_SAMESITE", "none")
    monkeypatch.setenv("SESSION_COOKIE_HTTPS_ONLY", "true")
    monkeypatch.setenv("TIP_WATCHLIST_STORE", "memory")
    monkeypatch.setenv("TIP_PROFILE", "memory")
    clear_settings_cache()
    from app.config import get_settings

    s = get_settings()
    assert "https://fe.example" in s.cors_origins_list()
    assert s.session_same_site() == "none"
    assert s.session_cookie_https_only is True
    clear_settings_cache()

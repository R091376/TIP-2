"""Settings parity with Java tip.* / Spring application.yml."""

from __future__ import annotations

import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    # Server
    server_port: int = Field(default=8080, alias="SERVER_PORT")

    # Upstox
    upstox_access_token: str = Field(default="", alias="UPSTOX_ACCESS_TOKEN")

    # Datasource (Postgres)
    database_url: str = Field(
        default="postgresql+psycopg://postgres:admin@localhost:5432/tip",
        alias="DATABASE_URL",
    )
    # Spring-style overrides if DATABASE_URL not set
    spring_datasource_url: str = Field(default="", alias="SPRING_DATASOURCE_URL")
    spring_datasource_username: str = Field(default="postgres", alias="SPRING_DATASOURCE_USERNAME")
    spring_datasource_password: str = Field(default="admin", alias="SPRING_DATASOURCE_PASSWORD")

    # Watchlist store: memory | postgres
    tip_watchlist_store: str = Field(default="postgres", alias="TIP_WATCHLIST_STORE")
    tip_profile: str = Field(default="", alias="TIP_PROFILE")  # "memory" forces open security

    # Session secret for cookie signing
    session_secret: str = Field(default="tip-dev-session-secret-change-me", alias="SESSION_SECRET")
    # Cookie flags for split deploy (cross-site FE/API on HTTPS → none + https_only)
    session_cookie_samesite: str = Field(default="lax", alias="SESSION_COOKIE_SAMESITE")
    session_cookie_https_only: bool = Field(default=False, alias="SESSION_COOKIE_HTTPS_ONLY")

    # Admin seed
    tip_admin_password: str = Field(default="admin", alias="TIP_ADMIN_PASSWORD")

    # Market
    default_symbol: str = "Nifty 50"
    default_instrument_key: str = "NSE_INDEX|Nifty 50"
    default_timeframe: str = "5m"
    supported_timeframes: list[str] = Field(
        default_factory=lambda: ["1m", "5m", "15m", "1h", "4h", "1d"]
    )
    live_feed_enabled: bool = True
    candle_update_throttle_ms: int = 1000
    phase_refresh_ms: int = 30_000
    historical_lookback_days: int = 30
    historical_lookback_days_by_timeframe: dict[str, int] = Field(
        default_factory=lambda: {
            "1m": 10,
            "5m": 60,
            "15m": 90,
            "1h": 180,
            "4h": 365,
            "1d": 730,
        }
    )
    seed_log_detail: bool = False

    # Patterns
    pattern_enabled: bool = True
    pattern_enabled_timeframes: dict[str, bool] = Field(
        default_factory=lambda: {
            "1m": False,
            "5m": True,
            "15m": True,
            "1h": True,
            "4h": True,
            "1d": True,
        }
    )
    atr_period: int = 14
    stats_min_sample_size: int = 20

    # Pattern detector knobs (mirror Java defaults)
    breakout: dict[str, Any] = Field(
        default_factory=lambda: {
            "lookback_candles": 20,
            "volume_avg_period": 20,
            "confirmation_mode": "both",
            "volume_multiplier": 1.5,
            "retest_atr_mult": 0.25,
            "strengthen_atr_mult": 1.0,
            "success_rr": 2.0,
            "success_atr_mult_without_retest": 2.0,
            "detector_version": "breakout-v1",
        }
    )
    breakdown: dict[str, Any] = Field(
        default_factory=lambda: {
            "lookback_candles": 20,
            "volume_avg_period": 20,
            "confirmation_mode": "both",
            "volume_multiplier": 1.5,
            "retest_atr_mult": 0.25,
            "strengthen_atr_mult": 1.0,
            "success_rr": 2.0,
            "success_atr_mult_without_retest": 2.0,
            "detector_version": "breakdown-v1",
        }
    )
    pinbar: dict[str, Any] = Field(
        default_factory=lambda: {
            "shadow_body_mult": 2.0,
            "max_body_range_ratio": 0.35,
            "max_opposite_wick_range_ratio": 0.25,
            "min_range_atr_mult": 0.5,
            "success_atr_mult": 1.5,
            "require_trend_context": True,
            "trend_lookback": 10,
            "max_candles_after_detect": 20,
            "detector_version": "pinbar-v1",
        }
    )
    engulfing: dict[str, Any] = Field(
        default_factory=lambda: {
            "min_range_atr_mult": 0.5,
            "success_atr_mult": 1.5,
            "max_candles_after_detect": 20,
            "detector_version": "engulfing-v1",
        }
    )
    inside_bar: dict[str, Any] = Field(
        default_factory=lambda: {
            "min_mother_range_atr_mult": 0.5,
            "success_atr_mult": 1.5,
            "max_candles_after_detect": 20,
            "max_bars_after_inside": 5,
            "detector_version": "inside-bar-v1",
        }
    )
    structure: dict[str, Any] = Field(
        default_factory=lambda: {
            "fractal_width": 2,
            "success_atr_mult": 1.5,
            "max_candles_after_detect": 30,
            "detector_version": "structure-v1",
        }
    )
    consolidation: dict[str, Any] = Field(
        default_factory=lambda: {
            "window_candles": 10,
            "range_atr_mult": 1.5,
            "max_duration_candles": 30,
            "tighten_ratio": 0.85,
            "detector_version": "consolidation-v1",
        }
    )
    volume_breakout: dict[str, Any] = Field(
        default_factory=lambda: {
            "volume_avg_period": 20,
            "volume_multiplier": 2.0,
            "min_range_atr_mult": 0.5,
            "success_atr_mult": 1.5,
            "max_candles_after_detect": 20,
            "detector_version": "volume-breakout-v1",
        }
    )
    expiry_session_close_timeframes: list[str] = Field(
        default_factory=lambda: ["1m", "5m", "15m"]
    )
    expiry_max_sessions_1h: int = 5
    expiry_max_candles_1h: int = 60
    expiry_max_sessions_4h: int = 5
    expiry_max_candles_4h: int = 60
    expiry_max_candles_1d: int = 30
    ws_broadcast_stages: list[str] = Field(
        default_factory=lambda: [
            "detected",
            "confirmed",
            "retested",
            "strengthened",
            "succeeded",
            "failed",
            "expired",
        ]
    )

    # Watchlist
    seed_symbols: list[str] = Field(
        default_factory=lambda: [
            "Nifty 50",
            "RELIANCE",
            "TCS",
            "HDFCBANK",
            "INFY",
            "ICICIBANK",
            "HINDUNILVR",
            "ITC",
            "SBIN",
            "BHARTIARTL",
        ]
    )
    seed_instrument_keys: dict[str, str] = Field(
        default_factory=lambda: {"Nifty 50": "NSE_INDEX|Nifty 50"}
    )
    soft_warn_size: int = 40
    hard_max_size: int = 50

    # Instruments
    instruments_master_url: str = (
        "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
    )
    instruments_cache_dir: str = Field(
        default_factory=lambda: str(Path(tempfile.gettempdir()) / "tip-instruments")
    )
    instruments_refresh_on_startup: bool = True

    # CORS (comma-separated). Include production FE origin on Render.
    cors_allowed_origins: str = Field(
        default="http://localhost:5173",
        alias="CORS_ALLOWED_ORIGINS",
    )

    # Users (bootstrap defaults — passwords match local tip DB)
    default_seed_cash: float = 100_000.0
    admin_username: str = "admin"
    admin_display_name: str = "Administrator"
    test_username: str = Field(default="test", alias="TIP_TEST_USERNAME")
    test_display_name: str = Field(default="Tester", alias="TIP_TEST_DISPLAY_NAME")
    tip_test_password: str = Field(default="test", alias="TIP_TEST_PASSWORD")

    @property
    def watchlist_store(self) -> str:
        store = (self.tip_watchlist_store or "postgres").strip().lower()
        if self.is_memory_profile:
            return "memory"
        return store

    @property
    def is_memory_profile(self) -> bool:
        if (self.tip_profile or "").strip().lower() == "memory":
            return True
        return (self.tip_watchlist_store or "").strip().lower() == "memory"

    @property
    def sqlalchemy_url(self) -> str:
        """SQLAlchemy URL using psycopg v3 driver.

        Neon / Render often supply ``postgres://`` or ``postgresql://``.
        Without ``+psycopg``, SQLAlchemy 2 may pick an unavailable driver and
        Postgres init fails → silent memory fallback → health stays DOWN.
        """
        if self.database_url and not self.spring_datasource_url:
            return normalize_sqlalchemy_url(self.database_url)
        jdbc = self.spring_datasource_url or ""
        if jdbc.startswith("jdbc:postgresql://"):
            host_db = jdbc.removeprefix("jdbc:postgresql://")
            user = self.spring_datasource_username
            password = self.spring_datasource_password
            return normalize_sqlalchemy_url(
                f"postgresql+psycopg://{user}:{password}@{host_db}"
            )
        return normalize_sqlalchemy_url(self.database_url)

    def lookback_days_for(self, timeframe: str) -> int:
        return self.historical_lookback_days_by_timeframe.get(
            timeframe, self.historical_lookback_days
        )

    def pattern_tf_enabled(self, timeframe: str) -> bool:
        if not self.pattern_enabled:
            return False
        return bool(self.pattern_enabled_timeframes.get(timeframe, False))

    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in (self.cors_allowed_origins or "").split(",") if o.strip()]

    def session_same_site(self) -> str:
        """Starlette SameSite value: lax | strict | none."""
        v = (self.session_cookie_samesite or "lax").strip().lower()
        if v in ("lax", "strict", "none"):
            return v
        return "lax"


def normalize_sqlalchemy_url(url: str) -> str:
    """Map common Postgres URL schemes to ``postgresql+psycopg://`` (psycopg3)."""
    u = (url or "").strip()
    if not u:
        return u
    if u.startswith("postgres://"):
        return "postgresql+psycopg://" + u[len("postgres://") :]
    if u.startswith("postgresql+psycopg://"):
        return u
    if u.startswith("postgresql+psycopg2://"):
        return "postgresql+psycopg://" + u[len("postgresql+psycopg2://") :]
    if u.startswith("postgresql://"):
        return "postgresql+psycopg://" + u[len("postgresql://") :]
    return u


@lru_cache
def get_settings() -> Settings:
    # Force critical env vars even if pydantic alias binding is flaky in some runtimes
    store = os.environ.get("TIP_WATCHLIST_STORE", "")
    profile = os.environ.get("TIP_PROFILE", "")
    cors = os.environ.get("CORS_ALLOWED_ORIGINS", "")
    same_site = os.environ.get("SESSION_COOKIE_SAMESITE", "")
    https_only = os.environ.get("SESSION_COOKIE_HTTPS_ONLY", "")
    settings = Settings()
    if store:
        object.__setattr__(settings, "tip_watchlist_store", store)
    if profile:
        object.__setattr__(settings, "tip_profile", profile)
    if cors:
        object.__setattr__(settings, "cors_allowed_origins", cors)
    if same_site:
        object.__setattr__(settings, "session_cookie_samesite", same_site)
    if https_only != "":
        object.__setattr__(
            settings,
            "session_cookie_https_only",
            https_only.strip().lower() in ("1", "true", "yes", "on"),
        )
    return settings


def clear_settings_cache() -> None:
    get_settings.cache_clear()

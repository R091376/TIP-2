"""Settings parity with Java tip.* / Spring application.yml."""

from __future__ import annotations

import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import Field, model_validator
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

    # Legacy alias kept so existing Render env still works; prefer JWT_SECRET.
    session_secret: str = Field(default="tip-dev-session-secret-change-me", alias="SESSION_SECRET")
    # JWT access tokens (Bearer). Falls back to SESSION_SECRET when unset.
    jwt_secret: str = Field(default="", alias="JWT_SECRET")
    jwt_expire_hours: int = Field(default=8, alias="JWT_EXPIRE_HOURS")

    # Admin seed
    tip_admin_password: str = Field(default="admin", alias="TIP_ADMIN_PASSWORD")

    # Market
    default_symbol: str = "Nifty 50"
    default_instrument_key: str = "NSE_INDEX|Nifty 50"
    default_timeframe: str = "5m"
    # Seed + live + chart TFs. 1m is gated by timeframe_1m_enabled (off by default
    # — ~2.6k historical bars/symbol and not used by pattern detectors).
    timeframe_1m_enabled: bool = Field(default=False, alias="TIP_TIMEFRAME_1M_ENABLED")
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
    # Minimum planned stop distance (risk_r = |entry−stop| ÷ ATR) required to
    # journal a new detection and raise WS/day alerts. Below this, the detect
    # is suppressed (no instance, no events). Set ≤0 to disable the gate.
    # Default 0.3R filters tiny-stop / inflated plan-R:R noise.
    pattern_min_risk_r: float = Field(default=0.3, alias="TIP_PATTERN_MIN_RISK_R")
    # Research / composable stack filters (query-time stats)
    pattern_research_stats_enabled: bool = Field(
        default=True, alias="TIP_PATTERN_RESEARCH_STATS_ENABLED"
    )
    # Hard cap for research detect dates (parse, live SQL, and snapshot).
    research_stats_max_range_days: int = Field(
        default=180, alias="TIP_RESEARCH_STATS_MAX_RANGE_DAYS"
    )
    research_stats_default_lookback_days: int = Field(
        default=180, alias="TIP_RESEARCH_STATS_DEFAULT_LOOKBACK_DAYS"
    )
    research_stats_statement_timeout_ms: int = Field(
        default=5000, alias="TIP_RESEARCH_STATS_STATEMENT_TIMEOUT_MS"
    )
    # Daily in-memory snapshot for research filters (Postgres journal only).
    research_stats_cache_enabled: bool = Field(
        default=True, alias="TIP_RESEARCH_STATS_CACHE_ENABLED"
    )
    research_stats_cache_ttl_seconds: int = Field(
        default=86_400, alias="TIP_RESEARCH_STATS_CACHE_TTL_SECONDS"
    )
    research_stats_cache_load_timeout_ms: int = Field(
        default=30_000, alias="TIP_RESEARCH_STATS_CACHE_LOAD_TIMEOUT_MS"
    )
    # Woodie daily S/R (woodie_open_v1)
    pattern_sr_enabled: bool = Field(default=True, alias="TIP_PATTERN_SR_ENABLED")
    pattern_sr_stamp_enabled: bool = Field(default=True, alias="TIP_PATTERN_SR_STAMP_ENABLED")
    pattern_sr_research_enabled: bool = Field(
        default=True, alias="TIP_PATTERN_SR_RESEARCH_ENABLED"
    )
    # Historical Woodie repair. Off at boot — run scripts/backfill_woodie_sr.py
    # after a schema change. Live today-rows still freeze via ensure_today.
    pattern_sr_backfill_on_startup: bool = Field(
        default=False, alias="TIP_PATTERN_SR_BACKFILL_ON_STARTUP"
    )
    pattern_sr_near_atr: float = Field(default=0.5, alias="TIP_PATTERN_SR_NEAR_ATR")
    pattern_sr_method: str = Field(default="woodie_open_v1", alias="TIP_PATTERN_SR_METHOD")
    pattern_double_enabled: bool = Field(default=True, alias="TIP_PATTERN_DOUBLE_ENABLED")
    pattern_hs_enabled: bool = Field(default=True, alias="TIP_PATTERN_HS_ENABLED")

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
    double: dict[str, Any] = Field(
        default_factory=lambda: {
            "enabled": True,
            "enable_bottom": True,
            "enable_top": True,
            "enabled_timeframes": {
                "1m": False,
                "5m": False,
                "15m": True,
                "1h": True,
                "4h": True,
                "1d": True,
            },
            "fractal_width": 2,
            "lookback_candles": 80,
            "trough_tolerance_atr": 0.35,
            "max_second_deeper_atr": 0.25,
            "min_pivot_separation": 5,
            "max_pivot_separation": 50,
            "min_height_atr": 1.0,
            "max_height_atr": 8.0,
            "stop_buffer_atr": 0.15,
            "measured_move_frac": 1.0,
            "success_atr_mult": 1.5,
            "target_mode": "measured",
            "retest_atr_mult": 0.25,
            "strengthen_atr_mult": 1.0,
            "confirmation_mode": "close",
            "volume_multiplier": 1.5,
            "volume_avg_period": 20,
            "max_candles_after_detect": 40,
            "detector_version": "double-v1",
            "log_rejects": False,
        }
    )
    head_shoulders: dict[str, Any] = Field(
        default_factory=lambda: {
            "enabled": True,
            "enable_regular": True,
            "enable_inverse": True,
            "enabled_timeframes": {
                "1m": False,
                "5m": False,
                "15m": True,
                "1h": True,
                "4h": True,
                "1d": True,
            },
            "fractal_width": 2,
            "lookback_candles": 100,
            "shoulder_tolerance_atr": 0.60,
            "min_head_prominence_atr": 0.50,
            "max_time_asymmetry": 2.5,
            "min_span_bars": 8,
            "max_span_bars": 70,
            "max_neckline_slope_atr_per_bar": 0.20,
            "allow_sloping_neckline": True,
            "stop_buffer_atr": 0.15,
            "measured_move_frac": 1.0,
            "success_atr_mult": 1.5,
            "target_mode": "measured",
            "retest_atr_mult": 0.25,
            "strengthen_atr_mult": 1.0,
            "confirmation_mode": "close",
            "volume_multiplier": 1.5,
            "volume_avg_period": 20,
            "max_candles_after_detect": 50,
            "detector_version": "hs-v1",
            "log_rejects": False,
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
            "reclaimed",
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

    # Paper trading (manual OMS)
    paper_enabled: bool = Field(default=True, alias="TIP_PAPER_ENABLED")
    paper_allow_memory: bool = Field(default=True, alias="TIP_PAPER_ALLOW_MEMORY")
    paper_market_lock_haircut: float = Field(default=1.02, alias="TIP_PAPER_MARKET_LOCK_HAIRCUT")
    paper_mis_square_off: str = Field(default="15:20", alias="TIP_PAPER_MIS_SQUARE_OFF")
    paper_mis_square_off_cas: str = Field(default="15:10", alias="TIP_PAPER_MIS_SQUARE_OFF_CAS")
    cas_session_enabled: bool = Field(default=True, alias="TIP_CAS_SESSION_ENABLED")
    paper_max_open_orders: int = Field(default=50, alias="TIP_PAPER_MAX_OPEN_ORDERS")
    paper_max_open_lots: int = Field(default=50, alias="TIP_PAPER_MAX_OPEN_LOTS")
    paper_max_fill_qty_per_tick: int | None = Field(
        default=None, alias="TIP_PAPER_MAX_FILL_QTY_PER_TICK"
    )

    # Offline pattern replay (admin). Worker process / laptop CLI; not the live desk.
    backtest_enabled: bool = Field(default=True, alias="TIP_BACKTEST_ENABLED")
    backtest_max_symbols: int = Field(default=20, alias="TIP_BACKTEST_MAX_SYMBOLS")
    backtest_max_range_days: int = Field(default=730, alias="TIP_BACKTEST_MAX_RANGE_DAYS")


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

    def sync_supported_timeframes(self) -> None:
        """Insert or strip 1m to match timeframe_1m_enabled."""
        tfs = list(self.supported_timeframes or [])
        if self.timeframe_1m_enabled:
            if "1m" not in tfs:
                tfs = ["1m", *tfs]
        else:
            tfs = [tf for tf in tfs if tf != "1m"]
        object.__setattr__(self, "supported_timeframes", tfs)

    @model_validator(mode="after")
    def _apply_timeframe_1m_flag(self):
        self.sync_supported_timeframes()
        return self

    def jwt_signing_secret(self) -> str:
        """Prefer JWT_SECRET; fall back to SESSION_SECRET for easy Render migration."""
        s = (self.jwt_secret or "").strip() or (self.session_secret or "").strip()
        return s or "tip-dev-session-secret-change-me"


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


def _env_bool(raw: str) -> bool | None:
    v = (raw or "").strip().lower()
    if v in ("1", "true", "yes", "on"):
        return True
    if v in ("0", "false", "no", "off"):
        return False
    return None


@lru_cache
def get_settings() -> Settings:
    # Force critical env vars even if pydantic alias binding is flaky in some runtimes
    store = os.environ.get("TIP_WATCHLIST_STORE", "")
    profile = os.environ.get("TIP_PROFILE", "")
    cors = os.environ.get("CORS_ALLOWED_ORIGINS", "")
    jwt_secret = os.environ.get("JWT_SECRET", "")
    jwt_hours = os.environ.get("JWT_EXPIRE_HOURS", "")
    session_secret = os.environ.get("SESSION_SECRET", "")
    tf_1m = os.environ.get("TIP_TIMEFRAME_1M_ENABLED", "")
    sr_backfill = os.environ.get("TIP_PATTERN_SR_BACKFILL_ON_STARTUP", "")
    cas_flag = os.environ.get("TIP_CAS_SESSION_ENABLED", "")
    settings = Settings()
    if store:
        object.__setattr__(settings, "tip_watchlist_store", store)
    if profile:
        object.__setattr__(settings, "tip_profile", profile)
    if cors:
        object.__setattr__(settings, "cors_allowed_origins", cors)
    if jwt_secret:
        object.__setattr__(settings, "jwt_secret", jwt_secret)
    if session_secret:
        object.__setattr__(settings, "session_secret", session_secret)
    if jwt_hours != "":
        try:
            object.__setattr__(settings, "jwt_expire_hours", int(jwt_hours))
        except ValueError:
            pass
    parsed_1m = _env_bool(tf_1m)
    if parsed_1m is not None:
        object.__setattr__(settings, "timeframe_1m_enabled", parsed_1m)
        settings.sync_supported_timeframes()
    parsed_backfill = _env_bool(sr_backfill)
    if parsed_backfill is not None:
        object.__setattr__(settings, "pattern_sr_backfill_on_startup", parsed_backfill)
    parsed_cas = _env_bool(cas_flag)
    if parsed_cas is not None:
        object.__setattr__(settings, "cas_session_enabled", parsed_cas)
    return settings


def clear_settings_cache() -> None:
    get_settings.cache_clear()

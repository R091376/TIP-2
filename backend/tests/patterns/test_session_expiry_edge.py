"""Session expiry multi-day edge cases for 1h/4h."""

from __future__ import annotations

from app.config import Settings
from app.market.candle_engine import CandleEngine
from app.patterns.active_store import ActiveInstanceStore
from app.patterns.journal import InMemoryPatternJournal
from app.patterns.models import PatternDirection, PatternType, new_pattern
from app.patterns.session_expiry import SessionExpiryReconciler
from app.events import MarketPhaseChangedEvent


def _pattern(tf: str, sessions_seen: int = 0):
    return new_pattern(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="K",
        timeframe=tf,
        direction=PatternDirection.LONG,
        reference_level=100,
        lookback_high=100,
        atr_at_detect=1,
        entry_price=101,
        stop_level=100,
        target_level=105,
        detect_candle_time=1,
        mfe_price=101,
        mae_price=100,
        sessions_seen=sessions_seen,
    )


def test_1h_increments_sessions_without_expire_under_max():
    settings = Settings()
    object.__setattr__(settings, "expiry_max_sessions_1h", 5)
    store = ActiveInstanceStore()
    journal = InMemoryPatternJournal()
    rec = SessionExpiryReconciler(settings, store, journal, CandleEngine())
    p = _pattern("1h", sessions_seen=1)
    store.put(p)
    n = rec.expire_on_session_close()
    # sessions_seen becomes 2, still under max 5
    assert n == 0
    open_p = store.get_open("K", "1h")
    assert len(open_p) == 1
    assert open_p[0].sessions_seen == 2


def test_4h_expires_at_max_sessions():
    settings = Settings()
    object.__setattr__(settings, "expiry_max_sessions_4h", 2)
    store = ActiveInstanceStore()
    journal = InMemoryPatternJournal()
    rec = SessionExpiryReconciler(settings, store, journal, CandleEngine())
    p = _pattern("4h", sessions_seen=1)
    store.put(p)
    n = rec.expire_on_session_close()
    assert n >= 1
    assert store.get_open("K", "4h") == []


def test_phase_changed_only_expires_on_closed():
    settings = Settings()
    store = ActiveInstanceStore()
    journal = InMemoryPatternJournal()
    rec = SessionExpiryReconciler(settings, store, journal, CandleEngine())
    p = _pattern("5m")
    store.put(p)
    rec.on_phase_changed(MarketPhaseChangedEvent("OPEN"))
    assert store.get_open("K", "5m")
    rec.on_phase_changed(MarketPhaseChangedEvent("CLOSED"))
    assert store.get_open("K", "5m") == []


def test_1d_not_session_close_expired():
    settings = Settings()
    store = ActiveInstanceStore()
    journal = InMemoryPatternJournal()
    rec = SessionExpiryReconciler(settings, store, journal, CandleEngine())
    p = _pattern("1d")
    store.put(p)
    n = rec.expire_on_session_close()
    # 1d not in session close list and not 1h/4h tracker → stays open
    assert n == 0
    assert store.get_open("K", "1d")

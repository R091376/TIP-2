from datetime import datetime, timezone

from app.config import Settings
from app.patterns.active_store import ActiveInstanceStore
from app.patterns.journal import InMemoryPatternJournal
from app.patterns.models import PatternDirection, PatternType, new_pattern
from app.patterns.session_expiry import SessionExpiryReconciler
from app.market.candle_engine import CandleEngine


def test_session_close_expires_intraday():
    settings = Settings()
    store = ActiveInstanceStore()
    journal = InMemoryPatternJournal()
    engine = CandleEngine()
    rec = SessionExpiryReconciler(settings, store, journal, engine)

    p = new_pattern(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="K",
        timeframe="5m",
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
    )
    store.put(p)
    n = rec.expire_on_session_close()
    assert n >= 1
    assert store.get_open("K", "5m") == []


def test_max_sessions_1h():
    settings = Settings()
    settings.expiry_max_sessions_1h = 2
    store = ActiveInstanceStore()
    journal = InMemoryPatternJournal()
    engine = CandleEngine()
    rec = SessionExpiryReconciler(settings, store, journal, engine)

    p = new_pattern(
        pattern_type=PatternType.HAMMER,
        symbol_id="K",
        timeframe="1h",
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
        sessions_seen=1,
    )
    store.put(p)
    # first close: sessions_seen -> 2 == max → expire
    n = rec.expire_on_session_close()
    assert n >= 1
    assert store.get_open("K", "1h") == []

from datetime import date, datetime

from app.events import CandleUpdatedEvent
from app.market.candle_boundary import NSE_ZONE, floor_to_candle_start_epoch_second
from app.market.candle_engine import CandleEngine
from app.market.models import Candle
from app.sr.service import DailySrService
from app.sr.store import InMemoryDailySrStore


class _Settings:
    pattern_sr_enabled = True


def _ist_0915(day: date) -> int:
    dt = datetime(day.year, day.month, day.day, 9, 15, tzinfo=NSE_ZONE)
    return floor_to_candle_start_epoch_second(int(dt.timestamp() * 1000), 1)


def test_first_1m_open_freezes_and_second_tick_skips_store(monkeypatch):
    engine = CandleEngine()
    store = InMemoryDailySrStore()
    calls = {"n": 0}
    orig = store.insert_if_absent

    def wrapped(*a, **k):
        calls["n"] += 1
        return orig(*a, **k)

    store.insert_if_absent = wrapped
    svc = DailySrService(_Settings(), engine, store)

    day = date(2026, 8, 17)  # Monday
    prev = Candle(
        int(datetime(2026, 8, 14, 0, 0, tzinfo=NSE_ZONE).timestamp()),
        10,
        12,
        10,
        11,
        1,
    )
    engine.seed("NSE_EQ|X", "1d", [prev])
    monkeypatch.setattr("app.sr.service.phase_from_clock", lambda: __import__(
        "app.market.nse_clock", fromlist=["MarketPhase"]
    ).MarketPhase.OPEN)
    monkeypatch.setattr("app.sr.service.is_trading_day", lambda d: True)

    t = _ist_0915(day)
    bar = Candle(t, 101.0, 101.0, 101.0, 101.0, 10)
    ev = CandleUpdatedEvent("NSE_EQ|X", "1m", bar, False)
    svc.on_candle_updated(ev)
    assert store.get("NSE_EQ|X", day) is not None
    assert store.get("NSE_EQ|X", day).today_open == 101.0
    assert calls["n"] == 1
    svc.on_candle_updated(ev)
    svc.on_candle_updated(CandleUpdatedEvent("NSE_EQ|X", "5m", bar, False))
    assert calls["n"] == 1


def test_first_5m_open_freezes_when_1m_disabled(monkeypatch):
    class _No1m:
        pattern_sr_enabled = True
        supported_timeframes = ["5m", "15m", "1h", "4h", "1d"]

    engine = CandleEngine()
    store = InMemoryDailySrStore()
    svc = DailySrService(_No1m(), engine, store)

    day = date(2026, 8, 17)
    prev = Candle(
        int(datetime(2026, 8, 14, 0, 0, tzinfo=NSE_ZONE).timestamp()),
        10,
        12,
        10,
        11,
        1,
    )
    engine.seed("NSE_EQ|X", "1d", [prev])
    monkeypatch.setattr("app.sr.service.phase_from_clock", lambda: __import__(
        "app.market.nse_clock", fromlist=["MarketPhase"]
    ).MarketPhase.OPEN)
    monkeypatch.setattr("app.sr.service.is_trading_day", lambda d: True)

    t = _ist_0915(day)
    bar = Candle(t, 101.0, 101.0, 101.0, 101.0, 10)
    svc.on_candle_updated(CandleUpdatedEvent("NSE_EQ|X", "1m", bar, False))
    assert store.get("NSE_EQ|X", day) is None
    svc.on_candle_updated(CandleUpdatedEvent("NSE_EQ|X", "5m", bar, False))
    assert store.get("NSE_EQ|X", day) is not None
    assert store.get("NSE_EQ|X", day).today_open == 101.0


def test_recover_prefers_1m_open_over_1d(monkeypatch):
    engine = CandleEngine()
    store = InMemoryDailySrStore()
    svc = DailySrService(_Settings(), engine, store)
    monkeypatch.setattr("app.sr.service.is_trading_day", lambda d: True)

    day = date(2026, 8, 17)
    prev = Candle(
        int(datetime(2026, 8, 14, 0, 0, tzinfo=NSE_ZONE).timestamp()),
        10,
        12,
        10,
        11,
        1,
    )
    daily = Candle(
        int(datetime(2026, 8, 17, 0, 0, tzinfo=NSE_ZONE).timestamp()),
        100.0,
        100.0,
        100.0,
        100.0,
        1,
    )
    m1 = Candle(_ist_0915(day), 101.0, 101.5, 100.5, 101.2, 10)
    engine.seed("NSE_EQ|X", "1d", [prev, daily])
    engine.seed("NSE_EQ|X", "1m", [m1])
    # last seed replaces? seed merges; ensure 1m is present
    svc.ensure_today("NSE_EQ|X", session_date=day)
    lv = store.get("NSE_EQ|X", day)
    assert lv is not None
    assert lv.today_open == 101.0

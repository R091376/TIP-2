from datetime import datetime
from zoneinfo import ZoneInfo

from app.events import CandleClosedEvent, EventBus
from app.market.candle_boundary import floor_to_candle_start_epoch_second
from app.market.candle_engine import CandleEngine
from app.market.models import Tick

IST = ZoneInfo("Asia/Kolkata")


def test_close_stale():
    engine = CandleEngine()
    # NSE session tick: 10:00 IST on a weekday
    t0 = datetime(2026, 7, 10, 10, 0, tzinfo=IST)
    t_ms = int(t0.timestamp() * 1000)
    engine.process_tick(Tick("K", 100.0, 100, t_ms), "5m")
    assert engine.get_current_candle("K", "5m") is not None
    # one hour later — boundary moved; open candle is stale
    n = engine.close_stale_open_candles(t_ms + 3600_000)
    assert n >= 1
    assert engine.get_current_candle("K", "5m") is None
    assert len(engine.get_closed_candles("K", "5m")) >= 1


def test_close_stale_does_not_close_last_rth_bar_after_hours():
    """After 15:30, floor(now) == last bar start → close_stale is a no-op."""
    engine = CandleEngine()
    # Last 5m bar of the session starts 15:25 IST
    last_bar = datetime(2026, 7, 10, 15, 25, tzinfo=IST)
    t_ms = int(last_bar.timestamp() * 1000)
    engine.process_tick(Tick("K", 100.0, 100, t_ms), "5m")
    assert engine.get_current_candle("K", "5m") is not None

    after_hours = datetime(2026, 7, 10, 16, 0, tzinfo=IST)
    after_ms = int(after_hours.timestamp() * 1000)
    # Sanity: floor after hours is still the last bar start
    assert floor_to_candle_start_epoch_second(after_ms, 5) == floor_to_candle_start_epoch_second(
        t_ms, 5
    )
    n = engine.close_stale_open_candles(after_ms)
    assert n == 0
    assert engine.get_current_candle("K", "5m") is not None


def test_finalize_session_candles_closes_all_intraday_tfs():
    bus = EventBus()
    closed_events: list[CandleClosedEvent] = []
    bus.subscribe(CandleClosedEvent, closed_events.append)
    engine = CandleEngine(bus)

    # Ticks inside the last bucket of each TF on 2026-07-10
    ticks = {
        "1m": datetime(2026, 7, 10, 15, 29, tzinfo=IST),
        "5m": datetime(2026, 7, 10, 15, 25, tzinfo=IST),
        "15m": datetime(2026, 7, 10, 15, 15, tzinfo=IST),
        "1h": datetime(2026, 7, 10, 14, 30, tzinfo=IST),  # last 1h starts 14:15
        "4h": datetime(2026, 7, 10, 14, 0, tzinfo=IST),  # last 4h starts 13:15
    }
    for tf, dt in ticks.items():
        engine.process_tick(Tick("NSE_EQ|X", 100.0, 1000, int(dt.timestamp() * 1000)), tf)
        assert engine.get_current_candle("NSE_EQ|X", tf) is not None

    # Daily: open for the calendar day — must survive finalize
    day_tick = datetime(2026, 7, 10, 10, 0, tzinfo=IST)
    engine.process_tick(
        Tick("NSE_EQ|X", 200.0, 2000, int(day_tick.timestamp() * 1000)), "1d"
    )
    assert engine.get_current_candle("NSE_EQ|X", "1d") is not None

    n = engine.finalize_session_candles()
    assert n == len(ticks)
    for tf in ticks:
        assert engine.get_current_candle("NSE_EQ|X", tf) is None
        assert len(engine.get_closed_candles("NSE_EQ|X", tf)) >= 1

    assert engine.get_current_candle("NSE_EQ|X", "1d") is not None

    closed_tfs = {e.timeframe for e in closed_events}
    assert closed_tfs == set(ticks.keys())
    assert "1d" not in closed_tfs

    # Idempotent
    assert engine.finalize_session_candles() == 0

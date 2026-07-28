from datetime import datetime
from zoneinfo import ZoneInfo

from app.events import CandleClosedEvent, EventBus
from app.market.candle_boundary import (
    floor_to_candle_start_epoch_second,
    last_session_bar_start_minutes,
    should_emit_session_finalize,
    should_seed_as_current,
)
from app.market.candle_engine import CandleEngine
from app.market.models import Candle, Tick

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

    # Same calendar day after hours (not wall-clock "today" — bars are 2026-07-10)
    after_ms = int(datetime(2026, 7, 10, 16, 0, tzinfo=IST).timestamp() * 1000)
    n = engine.finalize_session_candles(now_epoch_ms=after_ms)
    assert n == len(ticks)
    for tf in ticks:
        assert engine.get_current_candle("NSE_EQ|X", tf) is None
        assert len(engine.get_closed_candles("NSE_EQ|X", tf)) >= 1

    assert engine.get_current_candle("NSE_EQ|X", "1d") is not None

    closed_tfs = {e.timeframe for e in closed_events}
    assert closed_tfs == set(ticks.keys())
    assert "1d" not in closed_tfs

    # Idempotent
    assert engine.finalize_session_candles(now_epoch_ms=after_ms) == 0


def test_seed_pre_open_does_not_leave_yesterdays_last_bar_current():
    """Pre-09:15 floor(now) == prior last RTH bar — must stay closed.

    Otherwise CLOSED reconciler finalize re-emits CandleClosed next day and
    pattern alerts for yesterday's last candle appear in today's feed.
    """
    engine = CandleEngine()
    # Last 5m of 2026-07-10 session
    last_start = datetime(2026, 7, 10, 15, 25, tzinfo=IST)
    last_sec = int(last_start.timestamp())
    candles = [
        Candle(last_sec - 300, 99.0, 100.0, 98.0, 99.5, 100),
        Candle(last_sec, 100.0, 101.0, 99.0, 100.5, 200),
    ]
    # Next morning before open
    pre_open_ms = int(datetime(2026, 7, 11, 8, 30, tzinfo=IST).timestamp() * 1000)
    assert floor_to_candle_start_epoch_second(pre_open_ms, 5) == last_sec
    assert should_seed_as_current(last_sec, pre_open_ms, 5) is False

    engine.seed("K", "5m", candles, now_epoch_ms=pre_open_ms)
    assert engine.get_current_candle("K", "5m") is None
    closed = engine.get_closed_candles("K", "5m")
    assert len(closed) == 2
    assert closed[-1].time == last_sec


def test_seed_after_hours_same_day_keeps_last_bar_current():
    """Same-day after close: last bar may still need session finalize."""
    engine = CandleEngine()
    last_start = datetime(2026, 7, 10, 15, 25, tzinfo=IST)
    last_sec = int(last_start.timestamp())
    candles = [Candle(last_sec, 100.0, 101.0, 99.0, 100.5, 200)]
    after_ms = int(datetime(2026, 7, 10, 16, 0, tzinfo=IST).timestamp() * 1000)
    assert should_seed_as_current(last_sec, after_ms, 5) is True

    engine.seed("K", "5m", candles, now_epoch_ms=after_ms)
    assert engine.get_current_candle("K", "5m") is not None
    assert engine.get_current_candle("K", "5m").time == last_sec


def test_finalize_prior_calendar_day_bar_silent_no_candle_closed():
    """If a prior-day bar is still open (bad seed), finalize must not emit."""
    bus = EventBus()
    closed_events: list[CandleClosedEvent] = []
    bus.subscribe(CandleClosedEvent, closed_events.append)
    engine = CandleEngine(bus)

    last_start = datetime(2026, 7, 10, 15, 25, tzinfo=IST)
    t_ms = int(last_start.timestamp() * 1000)
    engine.process_tick(Tick("K", 100.0, 100, t_ms), "5m")
    assert engine.get_current_candle("K", "5m") is not None

    next_morning_ms = int(datetime(2026, 7, 11, 8, 0, tzinfo=IST).timestamp() * 1000)
    assert should_emit_session_finalize(
        int(last_start.timestamp()), next_morning_ms, 5
    ) is False

    n = engine.finalize_session_candles(now_epoch_ms=next_morning_ms)
    assert n == 1
    assert engine.get_current_candle("K", "5m") is None
    assert closed_events == []


def test_finalize_same_day_after_hours_still_emits():
    bus = EventBus()
    closed_events: list[CandleClosedEvent] = []
    bus.subscribe(CandleClosedEvent, closed_events.append)
    engine = CandleEngine(bus)

    last_start = datetime(2026, 7, 10, 15, 25, tzinfo=IST)
    t_ms = int(last_start.timestamp() * 1000)
    engine.process_tick(Tick("K", 100.0, 100, t_ms), "5m")

    after_ms = int(datetime(2026, 7, 10, 16, 5, tzinfo=IST).timestamp() * 1000)
    n = engine.finalize_session_candles(now_epoch_ms=after_ms)
    assert n == 1
    assert len(closed_events) == 1
    assert closed_events[0].candle.time == int(last_start.timestamp())


def test_pre_open_seed_plus_finalize_no_next_day_alerts_path():
    """End-to-end: next-day pre-open seed + CLOSED finalize must not emit."""
    bus = EventBus()
    closed_events: list[CandleClosedEvent] = []
    bus.subscribe(CandleClosedEvent, closed_events.append)
    engine = CandleEngine(bus)

    last_min = last_session_bar_start_minutes(5)
    h, m = divmod(last_min, 60)
    last_sec = int(datetime(2026, 7, 10, h, m, tzinfo=IST).timestamp())
    candles = [Candle(last_sec, 100.0, 101.0, 99.0, 100.5, 200)]
    pre_open_ms = int(datetime(2026, 7, 11, 9, 0, tzinfo=IST).timestamp() * 1000)

    engine.seed("NSE_EQ|X", "5m", candles, now_epoch_ms=pre_open_ms)
    n = engine.finalize_session_candles(now_epoch_ms=pre_open_ms)
    assert n == 0  # nothing left open
    assert closed_events == []

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.market.candle_boundary import (
    floor_to_candle_start_epoch_second,
    is_session_bar_start,
    last_session_bar_start_minutes,
)

IST = ZoneInfo("Asia/Kolkata")


def epoch_ms(y, m, d, h, minute):
    return int(datetime(y, m, d, h, minute, tzinfo=IST).timestamp() * 1000)


def floor_sec(y, m, d, h, minute, interval_minutes):
    return floor_to_candle_start_epoch_second(epoch_ms(y, m, d, h, minute), interval_minutes)


def expected_sec(y, m, d, h, minute):
    return int(datetime(y, m, d, h, minute, tzinfo=IST).timestamp())


def test_floors_fifteen_minutes():
    assert floor_sec(2026, 7, 10, 10, 17, 15) == expected_sec(2026, 7, 10, 10, 15)
    assert floor_sec(2026, 7, 10, 10, 44, 15) == expected_sec(2026, 7, 10, 10, 30)
    # Session open is a boundary
    assert floor_sec(2026, 7, 10, 9, 15, 15) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 9, 20, 15) == expected_sec(2026, 7, 10, 9, 15)
    # Upstox 15m grid: 09:15, 09:30, 09:45, 10:00 — not 09:00
    assert floor_sec(2026, 7, 10, 9, 29, 15) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 9, 30, 15) == expected_sec(2026, 7, 10, 9, 30)
    assert floor_sec(2026, 7, 10, 10, 0, 15) == expected_sec(2026, 7, 10, 10, 0)


def test_floors_five_minutes_aligned_to_session():
    assert floor_sec(2026, 7, 10, 9, 17, 5) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 9, 20, 5) == expected_sec(2026, 7, 10, 9, 20)
    assert floor_sec(2026, 7, 10, 10, 29, 5) == expected_sec(2026, 7, 10, 10, 25)
    # No 09:10 bucket — first RTH 5m is 09:15 (Upstox parity)
    assert floor_sec(2026, 7, 10, 9, 15, 5) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 9, 19, 5) == expected_sec(2026, 7, 10, 9, 15)


def test_floors_one_hour_aligned_to_session_open():
    # Upstox 1h NSE bars: 09:15, 10:15, 11:15, … (not wall-clock :00)
    assert floor_sec(2026, 7, 10, 9, 15, 60) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 10, 14, 60) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 10, 15, 60) == expected_sec(2026, 7, 10, 10, 15)
    assert floor_sec(2026, 7, 10, 10, 45, 60) == expected_sec(2026, 7, 10, 10, 15)
    assert floor_sec(2026, 7, 10, 11, 15, 60) == expected_sec(2026, 7, 10, 11, 15)
    assert floor_sec(2026, 7, 10, 15, 0, 60) == expected_sec(2026, 7, 10, 14, 15)


def test_floors_four_hours_aligned_to_session_open():
    # Upstox 4h NSE bars: 09:15, 13:15 (not 05:15 / 08:00)
    assert floor_sec(2026, 7, 10, 9, 15, 240) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 12, 30, 240) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 13, 15, 240) == expected_sec(2026, 7, 10, 13, 15)
    assert floor_sec(2026, 7, 10, 15, 30, 240) == expected_sec(2026, 7, 10, 13, 15)


def test_floors_daily_to_midnight():
    assert floor_sec(2026, 7, 10, 15, 30, 24 * 60) == expected_sec(2026, 7, 10, 0, 0)


def test_pre_open_floors_to_previous_day_last_bar():
    """Pre-09:15 instants map to prior calendar day last RTH bar (not 09:10/08:15)."""
    prev = datetime(2026, 7, 10, 0, 0, tzinfo=IST).date() - timedelta(days=1)
    # 5m last = 15:25
    assert last_session_bar_start_minutes(5) == 15 * 60 + 25
    assert floor_sec(2026, 7, 10, 9, 10, 5) == expected_sec(
        prev.year, prev.month, prev.day, 15, 25
    )
    # 1h last = 15:15
    assert floor_sec(2026, 7, 10, 8, 30, 60) == expected_sec(
        prev.year, prev.month, prev.day, 15, 15
    )
    # 4h last = 13:15
    assert floor_sec(2026, 7, 10, 5, 30, 240) == expected_sec(
        prev.year, prev.month, prev.day, 13, 15
    )


def test_is_session_bar_start():
    assert is_session_bar_start(expected_sec(2026, 7, 10, 9, 15), 5)
    assert is_session_bar_start(expected_sec(2026, 7, 10, 9, 20), 5)
    assert not is_session_bar_start(expected_sec(2026, 7, 10, 9, 10), 5)
    assert not is_session_bar_start(expected_sec(2026, 7, 10, 9, 0), 15)
    assert not is_session_bar_start(expected_sec(2026, 7, 10, 8, 15), 60)
    assert not is_session_bar_start(expected_sec(2026, 7, 10, 5, 15), 240)
    assert is_session_bar_start(expected_sec(2026, 7, 10, 9, 15), 240)
    assert is_session_bar_start(expected_sec(2026, 7, 10, 13, 15), 240)

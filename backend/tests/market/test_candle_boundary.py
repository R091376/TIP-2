from datetime import datetime
from zoneinfo import ZoneInfo

from app.market.candle_boundary import floor_to_candle_start_epoch_second

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
    assert floor_sec(2026, 7, 10, 9, 15, 15) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 9, 20, 15) == expected_sec(2026, 7, 10, 9, 15)


def test_floors_five_minutes_aligned_to_session():
    assert floor_sec(2026, 7, 10, 9, 17, 5) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 9, 20, 5) == expected_sec(2026, 7, 10, 9, 20)
    assert floor_sec(2026, 7, 10, 10, 29, 5) == expected_sec(2026, 7, 10, 10, 25)


def test_floors_one_hour_aligned_to_session_open():
    assert floor_sec(2026, 7, 10, 9, 15, 60) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 10, 14, 60) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 10, 15, 60) == expected_sec(2026, 7, 10, 10, 15)
    assert floor_sec(2026, 7, 10, 10, 45, 60) == expected_sec(2026, 7, 10, 10, 15)
    assert floor_sec(2026, 7, 10, 11, 15, 60) == expected_sec(2026, 7, 10, 11, 15)
    assert floor_sec(2026, 7, 10, 15, 0, 60) == expected_sec(2026, 7, 10, 14, 15)


def test_floors_four_hours_aligned_to_session_open():
    assert floor_sec(2026, 7, 10, 9, 15, 240) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 12, 30, 240) == expected_sec(2026, 7, 10, 9, 15)
    assert floor_sec(2026, 7, 10, 13, 15, 240) == expected_sec(2026, 7, 10, 13, 15)
    assert floor_sec(2026, 7, 10, 15, 30, 240) == expected_sec(2026, 7, 10, 13, 15)


def test_floors_daily_to_midnight():
    assert floor_sec(2026, 7, 10, 15, 30, 24 * 60) == expected_sec(2026, 7, 10, 0, 0)

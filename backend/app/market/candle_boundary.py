"""
NSE cash-session candle boundaries.

Intraday buckets are anchored at session open **09:15 IST**, not midnight wall-clock
grids. That matches Upstox History V3 for NSE (5m/15m/1h/4h all start at 09:15).

Previous formula ``origin = 09:15 % interval`` still allowed pre-session starts
(e.g. 5m@09:10, 15m@09:00, 1h@08:15, 4h@05:15). Those closed at the first live
09:15 tick and fired false pattern alerts.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

NSE_ZONE = ZoneInfo("Asia/Kolkata")
NSE_SESSION_OPEN_MINUTES = 9 * 60 + 15  # 09:15
NSE_SESSION_CLOSE_MINUTES = 15 * 60 + 30  # 15:30


def session_open_minutes() -> int:
    return NSE_SESSION_OPEN_MINUTES


def session_close_minutes() -> int:
    return NSE_SESSION_CLOSE_MINUTES


def last_session_bar_start_minutes(interval_minutes: int) -> int:
    """Minutes-from-midnight IST of the last bar start on a full session day."""
    if interval_minutes <= 0:
        raise ValueError(f"intervalMinutes must be positive: {interval_minutes}")
    # Last bar whose start is still before close
    session_len = NSE_SESSION_CLOSE_MINUTES - NSE_SESSION_OPEN_MINUTES
    if session_len <= 0:
        return NSE_SESSION_OPEN_MINUTES
    n = max(0, (session_len - 1) // interval_minutes)
    return NSE_SESSION_OPEN_MINUTES + n * interval_minutes


def _epoch_for_day_minutes(day: date, minutes_of_day: int) -> int:
    start = datetime(
        day.year, day.month, day.day, 0, 0, 0, tzinfo=NSE_ZONE
    ) + timedelta(minutes=minutes_of_day)
    return int(start.timestamp())


def floor_to_candle_start_epoch_second(epoch_millis: int, interval_minutes: int) -> int:
    """Floor an instant to the start of its NSE session candle bucket (epoch seconds)."""
    if interval_minutes <= 0:
        raise ValueError(f"intervalMinutes must be positive: {interval_minutes}")

    date_time = datetime.fromtimestamp(epoch_millis / 1000.0, tz=NSE_ZONE)

    # Daily (and multi-day treated as calendar day in IST)
    if interval_minutes >= 24 * 60:
        midnight = date_time.replace(hour=0, minute=0, second=0, microsecond=0)
        return int(midnight.timestamp())

    minutes_of_day = date_time.hour * 60 + date_time.minute
    day = date_time.date()

    # Before cash open → attribute to previous calendar day's last RTH bar.
    # (Live path should not process ticks here; this is for safety / remap.)
    if minutes_of_day < NSE_SESSION_OPEN_MINUTES:
        prev = day - timedelta(days=1)
        return _epoch_for_day_minutes(prev, last_session_bar_start_minutes(interval_minutes))

    # At/after close → last bar of this session day
    if minutes_of_day >= NSE_SESSION_CLOSE_MINUTES:
        return _epoch_for_day_minutes(day, last_session_bar_start_minutes(interval_minutes))

    elapsed = minutes_of_day - NSE_SESSION_OPEN_MINUTES
    floored_elapsed = (elapsed // interval_minutes) * interval_minutes
    start_minutes = NSE_SESSION_OPEN_MINUTES + floored_elapsed
    return _epoch_for_day_minutes(day, start_minutes)


def is_session_bar_start(epoch_seconds: int, interval_minutes: int) -> bool:
    """True if ``epoch_seconds`` is a valid RTH bar start for this interval."""
    if interval_minutes <= 0:
        return False
    if interval_minutes >= 24 * 60:
        dt = datetime.fromtimestamp(epoch_seconds, tz=NSE_ZONE)
        return dt.hour == 0 and dt.minute == 0 and dt.second == 0

    dt = datetime.fromtimestamp(epoch_seconds, tz=NSE_ZONE)
    minutes_of_day = dt.hour * 60 + dt.minute
    if minutes_of_day < NSE_SESSION_OPEN_MINUTES:
        return False
    if minutes_of_day >= NSE_SESSION_CLOSE_MINUTES:
        return False
    elapsed = minutes_of_day - NSE_SESSION_OPEN_MINUTES
    return elapsed % interval_minutes == 0

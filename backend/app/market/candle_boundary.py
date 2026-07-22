from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

NSE_ZONE = ZoneInfo("Asia/Kolkata")
NSE_SESSION_OPEN_MINUTES = 9 * 60 + 15


def floor_to_candle_start_epoch_second(epoch_millis: int, interval_minutes: int) -> int:
    """Floor an instant to the start of its candle bucket in NSE zone."""
    if interval_minutes <= 0:
        raise ValueError(f"intervalMinutes must be positive: {interval_minutes}")

    date_time = datetime.fromtimestamp(epoch_millis / 1000.0, tz=NSE_ZONE)

    if interval_minutes >= 24 * 60:
        midnight = date_time.replace(hour=0, minute=0, second=0, microsecond=0)
        return int(midnight.timestamp())

    minutes_of_day = date_time.hour * 60 + date_time.minute
    origin = NSE_SESSION_OPEN_MINUTES % interval_minutes
    shifted = minutes_of_day - origin
    day = date_time.date()

    if shifted < 0:
        day = day - timedelta(days=1)
        last_floored = origin + ((24 * 60 - 1 - origin) // interval_minutes) * interval_minutes
        start = datetime(
            day.year, day.month, day.day, 0, 0, 0, tzinfo=NSE_ZONE
        ) + timedelta(minutes=last_floored)
        return int(start.timestamp())

    floored_minutes = origin + (shifted // interval_minutes) * interval_minutes
    start = datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=NSE_ZONE) + timedelta(
        minutes=floored_minutes
    )
    return int(start.timestamp())

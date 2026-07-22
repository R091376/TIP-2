from __future__ import annotations

from datetime import date, datetime, time
from enum import Enum
from zoneinfo import ZoneInfo

from app.market.candle_boundary import NSE_ZONE
from app.market.nse_holidays import is_holiday


class MarketPhase(str, Enum):
    PRE_OPEN = "PRE_OPEN"
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class BootstrapStatus(str, Enum):
    PENDING = "PENDING"
    READY = "READY"
    FAILED = "FAILED"


_PRE_OPEN_START = time(9, 0)
_MARKET_OPEN = time(9, 15)
_MARKET_CLOSE = time(15, 30)


def is_trading_day(d: date | None) -> bool:
    if d is None:
        return False
    if d.weekday() >= 5:  # Sat/Sun
        return False
    return not is_holiday(d)


def phase_at(now: datetime) -> MarketPhase:
    if now.tzinfo is None:
        now = now.replace(tzinfo=NSE_ZONE)
    else:
        now = now.astimezone(NSE_ZONE)

    day = now.date()
    if not is_trading_day(day):
        return MarketPhase.CLOSED

    t = now.time()
    if t < _PRE_OPEN_START or t >= _MARKET_CLOSE:
        return MarketPhase.CLOSED
    if t < _MARKET_OPEN:
        return MarketPhase.PRE_OPEN
    return MarketPhase.OPEN


def phase_from_clock() -> MarketPhase:
    return phase_at(datetime.now(tz=NSE_ZONE))

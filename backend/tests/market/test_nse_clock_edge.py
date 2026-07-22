"""NSE clock + holiday edge cases."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.market.nse_clock import MarketPhase, is_trading_day, phase_at
from app.market.nse_holidays import is_holiday

IST = ZoneInfo("Asia/Kolkata")


def test_pre_open_boundaries():
    # 09:00 inclusive PRE_OPEN, 09:14 PRE_OPEN, 09:15 OPEN
    assert phase_at(datetime(2026, 7, 10, 9, 0, tzinfo=IST)) == MarketPhase.PRE_OPEN
    assert phase_at(datetime(2026, 7, 10, 9, 14, 59, tzinfo=IST)) == MarketPhase.PRE_OPEN
    assert phase_at(datetime(2026, 7, 10, 9, 15, tzinfo=IST)) == MarketPhase.OPEN


def test_close_boundary():
    assert phase_at(datetime(2026, 7, 10, 15, 29, 59, tzinfo=IST)) == MarketPhase.OPEN
    assert phase_at(datetime(2026, 7, 10, 15, 30, tzinfo=IST)) == MarketPhase.CLOSED


def test_before_pre_open_closed():
    assert phase_at(datetime(2026, 7, 10, 8, 59, tzinfo=IST)) == MarketPhase.CLOSED


def test_weekend_saturday_sunday():
    assert phase_at(datetime(2026, 7, 11, 10, 0, tzinfo=IST)) == MarketPhase.CLOSED  # Sat
    assert phase_at(datetime(2026, 7, 12, 10, 0, tzinfo=IST)) == MarketPhase.CLOSED  # Sun
    assert not is_trading_day(datetime(2026, 7, 11, tzinfo=IST).date())


def test_holiday_2026_republic_day():
    d = datetime(2026, 1, 26).date()
    assert is_holiday(d)
    assert not is_trading_day(d)
    assert phase_at(datetime(2026, 1, 26, 10, 0, tzinfo=IST)) == MarketPhase.CLOSED


def test_holiday_2026_diwali():
    # from nse_holidays calendar
    assert is_holiday(datetime(2026, 11, 8).date())
    assert phase_at(datetime(2026, 11, 8, 11, 0, tzinfo=IST)) == MarketPhase.CLOSED


def test_naive_datetime_assumed_ist():
    # phase_at promotes naive to IST
    assert phase_at(datetime(2026, 7, 10, 10, 0)) == MarketPhase.OPEN


def test_utc_converted_to_ist():
    # 10:00 UTC = 15:30 IST on Jul 10 2026 → CLOSED at exact close
    from datetime import timezone

    utc = datetime(2026, 7, 10, 10, 0, tzinfo=timezone.utc)
    # 10:00 UTC = 15:30 IST
    assert phase_at(utc) == MarketPhase.CLOSED

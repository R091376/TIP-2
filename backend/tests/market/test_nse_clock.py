from datetime import datetime
from zoneinfo import ZoneInfo

from app.market.nse_clock import MarketPhase, phase_at

IST = ZoneInfo("Asia/Kolkata")


def test_open_session():
    # 2026-07-10 is Friday
    assert phase_at(datetime(2026, 7, 10, 10, 0, tzinfo=IST)) == MarketPhase.OPEN


def test_pre_open():
    assert phase_at(datetime(2026, 7, 10, 9, 5, tzinfo=IST)) == MarketPhase.PRE_OPEN


def test_closed_after():
    assert phase_at(datetime(2026, 7, 10, 15, 30, tzinfo=IST)) == MarketPhase.CLOSED


def test_weekend():
    assert phase_at(datetime(2026, 7, 11, 10, 0, tzinfo=IST)) == MarketPhase.CLOSED

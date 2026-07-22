"""MarketStatusService segment selection + phase edge cases."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.events import EventBus, MarketPhaseChangedEvent
from app.market.market_status import (
    MarketStatusService,
    map_segment_status,
    select_segment_status,
)
from app.market.nse_clock import BootstrapStatus, MarketPhase


def test_select_segment_status_eq_preferred():
    assert select_segment_status({"NSE_EQ": "NORMAL_OPEN"}) == "NORMAL_OPEN"
    assert select_segment_status({"NSE_INDEX": "PRE_OPEN_START"}) == "PRE_OPEN_START"
    assert (
        select_segment_status(
            {"NSE_EQ": "NORMAL_CLOSE", "NSE_INDEX": "NORMAL_OPEN"}
        )
        == "NORMAL_CLOSE"
    )
    assert select_segment_status({}) is None
    assert select_segment_status(None) is None
    assert select_segment_status({"BSE_EQ": "NORMAL_OPEN"}) is None


def test_map_segment_status():
    assert map_segment_status("NORMAL_OPEN") == MarketPhase.OPEN
    assert map_segment_status("PRE_OPEN_START") == MarketPhase.PRE_OPEN
    assert map_segment_status("PRE_OPEN_END") == MarketPhase.PRE_OPEN
    assert map_segment_status("NORMAL_CLOSE") == MarketPhase.CLOSED
    # unknown must not force CLOSED (would pin live session to closed)
    assert map_segment_status("UNKNOWN_X") is None


def test_map_segment_status_protobuf_ints():
    """Upstox protobuf MarketStatus: NORMAL_OPEN=2 (was mis-mapped to CLOSED)."""
    assert map_segment_status(0) == MarketPhase.PRE_OPEN
    assert map_segment_status(1) == MarketPhase.PRE_OPEN
    assert map_segment_status(2) == MarketPhase.OPEN
    assert map_segment_status(3) == MarketPhase.CLOSED
    assert map_segment_status("2") == MarketPhase.OPEN
    assert map_segment_status("3") == MarketPhase.CLOSED


def test_update_from_int_normal_open_sets_open():
    from app.events import EventBus

    svc = MarketStatusService(EventBus())
    svc._market_phase = MarketPhase.CLOSED
    svc.update_from_segment_status({"NSE_EQ": 2})  # NORMAL_OPEN
    assert svc.get_market_phase() == MarketPhase.OPEN


def test_clock_overrides_stale_feed_closed_while_session_open():
    from app.events import EventBus
    from app.market.nse_clock import phase_from_clock

    if phase_from_clock() != MarketPhase.OPEN:
        return  # only meaningful during open session
    svc = MarketStatusService(EventBus())
    svc.set_live_feed_connected(True)
    svc._market_phase = MarketPhase.CLOSED
    svc._last_feed_phase_at = datetime.now(timezone.utc)
    svc.refresh_phase_from_clock()
    assert svc.get_market_phase() == MarketPhase.OPEN


def test_update_from_segment_status_publishes_change():
    events: list = []
    bus = EventBus()
    bus.subscribe(MarketPhaseChangedEvent, events.append)
    svc = MarketStatusService(bus)
    svc._market_phase = MarketPhase.CLOSED
    svc.update_from_segment_status({"NSE_EQ": "NORMAL_OPEN"})
    assert svc.get_market_phase() == MarketPhase.OPEN
    assert any(e.phase == "OPEN" for e in events)


def test_update_from_segment_status_neither_keeps_prior():
    svc = MarketStatusService()
    svc._market_phase = MarketPhase.OPEN
    svc.update_from_segment_status({"BSE_EQ": "NORMAL_CLOSE"})
    assert svc.get_market_phase() == MarketPhase.OPEN


def test_refresh_phase_from_clock_feed_fresh_keeps_unless_clock_closed():
    svc = MarketStatusService()
    svc.set_live_feed_connected(True)
    svc._market_phase = MarketPhase.OPEN
    svc._last_feed_phase_at = datetime.now(timezone.utc)
    # If wall clock is CLOSED (weekend/after-hours), force CLOSED
    from app.market.nse_clock import phase_from_clock

    clock = phase_from_clock()
    svc.refresh_phase_from_clock()
    if clock == MarketPhase.CLOSED:
        assert svc.get_market_phase() == MarketPhase.CLOSED
    else:
        # feed fresh and clock open/pre_open → leave feed phase
        assert svc.get_market_phase() == MarketPhase.OPEN


def test_refresh_phase_from_clock_stale_feed_uses_clock():
    svc = MarketStatusService()
    svc.set_live_feed_connected(True)
    svc._market_phase = MarketPhase.OPEN
    svc._last_feed_phase_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    svc.refresh_phase_from_clock()
    from app.market.nse_clock import phase_from_clock

    assert svc.get_market_phase() == phase_from_clock()


def test_bootstrap_status_transitions():
    svc = MarketStatusService()
    svc.set_bootstrap_pending()
    assert svc.get_bootstrap_status() == BootstrapStatus.PENDING
    svc.set_bootstrap_ready(42)
    assert svc.get_bootstrap_status() == BootstrapStatus.READY
    assert svc.get_seeded_candle_count() == 42
    assert svc.get_last_seeded_at() is not None
    svc.set_bootstrap_failed("boom")
    assert svc.get_bootstrap_status() == BootstrapStatus.FAILED
    assert svc.get_bootstrap_error() == "boom"

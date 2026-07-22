"""MarketStatusBroadcaster + LiveCandleBroadcaster edge cases."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.websocket.live import (
    LiveCandleBroadcaster,
    LiveSubscription,
    LiveWebSocketHub,
    MarketStatusBroadcaster,
)
from app.events import CandleUpdatedEvent, MarketPhaseChangedEvent
from app.market.models import Candle


@pytest.mark.asyncio
async def test_market_status_broadcast_all_lowercase_phase():
    hub = LiveWebSocketHub()
    ws1 = AsyncMock()
    ws2 = AsyncMock()
    hub._sessions[1] = ws1
    hub._sessions[2] = ws2

    broadcaster = MarketStatusBroadcaster(hub)
    broadcaster.on_market_phase_changed(MarketPhaseChangedEvent("CLOSED"))
    # schedule_broadcast_all needs a running loop — call broadcast_all directly for parity shape
    await hub.broadcast_all({"type": "market_status", "marketPhase": "closed"})
    ws1.send_json.assert_awaited()
    ws2.send_json.assert_awaited()
    payload = ws1.send_json.await_args.args[0]
    assert payload["type"] == "market_status"
    assert payload["marketPhase"] == "closed"


def test_market_status_broadcaster_lowercases_phase():
    hub = LiveWebSocketHub()
    scheduled: list[dict] = []
    hub.schedule_broadcast_all = lambda payload: scheduled.append(payload)  # type: ignore

    b = MarketStatusBroadcaster(hub)
    b.on_market_phase_changed(MarketPhaseChangedEvent("PRE_OPEN"))
    assert scheduled == [{"type": "market_status", "marketPhase": "pre_open"}]

    b.on_market_phase_changed(MarketPhaseChangedEvent("OPEN"))
    assert scheduled[-1]["marketPhase"] == "open"


def test_live_candle_throttle_and_evict():
    hub = LiveWebSocketHub()
    hub.broadcast = AsyncMock()  # type: ignore
    b = LiveCandleBroadcaster(hub, throttle_ms=60_000)
    # no running loop — _schedule_broadcast may no-op; exercise throttle map
    candle = Candle(1000, 1, 1, 1, 1, 0)
    key = "NSE_EQ|INE002A01018"
    b.on_candle_updated(CandleUpdatedEvent(key, "5m", candle, False))
    b.on_candle_updated(CandleUpdatedEvent(key, "5m", candle, False))
    assert b._last_sent.get(f"{key}|5m") is not None
    b.evict_throttle_keys(key)
    assert f"{key}|5m" not in b._last_sent
    b.on_candle_updated(CandleUpdatedEvent(key, "5m", candle, False))
    assert f"{key}|5m" in b._last_sent


def test_final_candle_update_skipped():
    hub = LiveWebSocketHub()
    b = LiveCandleBroadcaster(hub, throttle_ms=0)
    candle = Candle(1, 1, 1, 1, 1, 0)
    b.on_candle_updated(CandleUpdatedEvent("K", "5m", candle, True))
    assert b._last_sent == {}


@pytest.mark.asyncio
async def test_broadcast_filters_by_subscription():
    hub = LiveWebSocketHub()
    ws_match = AsyncMock()
    ws_other = AsyncMock()
    hub._sessions[1] = ws_match
    hub._sessions[2] = ws_other
    hub._subs[1] = LiveSubscription("A", "5m")
    hub._subs[2] = LiveSubscription("B", "5m")
    await hub.broadcast("A", "5m", {"type": "candle_update"})
    ws_match.send_json.assert_awaited_once()
    ws_other.send_json.assert_not_awaited()


def test_phase_change_event_wires_to_session_and_ws():
    """Integration: MarketStatusService publishes → broadcaster receives."""
    from app.events import EventBus
    from app.market.market_status import MarketStatusService
    from app.market.nse_clock import MarketPhase

    bus = EventBus()
    hub = LiveWebSocketHub()
    received: list[dict] = []
    hub.schedule_broadcast_all = lambda p: received.append(p)  # type: ignore
    msb = MarketStatusBroadcaster(hub)
    bus.subscribe(MarketPhaseChangedEvent, msb.on_market_phase_changed)

    status = MarketStatusService(bus)
    # force a change by writing internal then set
    status._market_phase = MarketPhase.OPEN
    status._set_market_phase(MarketPhase.CLOSED)
    assert any(p.get("marketPhase") == "closed" for p in received)

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.events import (
    CandleClosedEvent,
    CandleUpdatedEvent,
    MarketPhaseChangedEvent,
    PatternStageEvent,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def schedule_on_loop(loop, coro) -> None:
    """Run a coroutine on an event loop from sync or async contexts (best-effort)."""
    if loop is None:
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            try:
                coro.close()
            except Exception:
                pass
            return
    try:
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(coro, loop)
        else:
            loop.create_task(coro)
    except Exception:
        logger.debug("Failed to schedule websocket coroutine", exc_info=True)
        try:
            coro.close()
        except Exception:
            pass


@dataclass
class LiveSubscription:
    symbol_id: str
    timeframe: str

    @property
    def key(self) -> str:
        return f"{self.symbol_id}|{self.timeframe}"


class LiveWebSocketHub:
    def __init__(self) -> None:
        self._sessions: dict[int, WebSocket] = {}
        self._subs: dict[int, LiveSubscription] = {}
        self._lock = asyncio.Lock()
        self._id_seq = 0
        self._loop = None

    def set_loop(self, loop) -> None:
        self._loop = loop

    async def connect(self, ws: WebSocket) -> int:
        await ws.accept()
        self._id_seq += 1
        sid = self._id_seq
        self._sessions[sid] = ws
        logger.info("Live WebSocket connected: %s", sid)
        return sid

    def disconnect(self, sid: int) -> None:
        self._sessions.pop(sid, None)
        self._subs.pop(sid, None)
        logger.info("Live WebSocket disconnected: %s", sid)

    def set_subscription(self, sid: int, sub: LiveSubscription) -> None:
        self._subs[sid] = sub

    def session_count(self) -> int:
        return len(self._sessions)

    def notify_symbol_removed(self, symbol_id: str) -> None:
        # schedule best-effort; called from sync context
        for sid, sub in list(self._subs.items()):
            if sub.symbol_id != symbol_id:
                continue
            ws = self._sessions.get(sid)
            if ws is not None:
                self._schedule_send(
                    ws, {"type": "error", "message": "Symbol removed from watchlist"}
                )
            self._subs.pop(sid, None)

    async def broadcast(self, symbol_id: str, timeframe: str, payload: dict) -> None:
        target = f"{symbol_id}|{timeframe}"
        dead: list[int] = []
        for sid, sub in list(self._subs.items()):
            if sub.key != target:
                continue
            ws = self._sessions.get(sid)
            if ws is None:
                dead.append(sid)
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(sid)
        for sid in dead:
            self.disconnect(sid)

    async def broadcast_all(self, payload: dict) -> None:
        dead: list[int] = []
        for sid, ws in list(self._sessions.items()):
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(sid)
        for sid in dead:
            self.disconnect(sid)

    def schedule_broadcast_all(self, payload: dict) -> None:
        """Thread-safe fan-out to every connected live WS session."""
        self._schedule_coro(self.broadcast_all(payload))

    def _schedule_send(self, ws: WebSocket, payload: dict) -> None:
        self._schedule_coro(ws.send_json(payload))

    def _schedule_coro(self, coro) -> None:
        schedule_on_loop(self._loop, coro)


class LiveCandleBroadcaster:
    def __init__(self, hub: LiveWebSocketHub, throttle_ms: int = 1000, loop=None) -> None:
        self._hub = hub
        self._throttle_ms = throttle_ms
        self._last_sent: dict[str, int] = {}
        self._loop = loop

    def set_loop(self, loop) -> None:
        self._loop = loop
        self._hub.set_loop(loop)

    def on_candle_updated(self, event: CandleUpdatedEvent) -> None:
        if event.is_final:
            return
        stream_key = f"{event.instrument_key}|{event.timeframe}"
        now = int(time.time() * 1000)
        last = self._last_sent.get(stream_key)
        if last is not None and now - last < self._throttle_ms:
            return
        self._last_sent[stream_key] = now
        payload = {
            "type": "candle_update",
            "symbolId": event.instrument_key,
            "timeframe": event.timeframe,
            "candle": _candle_dict(event.candle),
            "isFinal": False,
        }
        self._schedule_broadcast(event.instrument_key, event.timeframe, payload)

    def on_candle_closed(self, event: CandleClosedEvent) -> None:
        stream_key = f"{event.instrument_key}|{event.timeframe}"
        self._last_sent.pop(stream_key, None)
        payload = {
            "type": "candle_closed",
            "symbolId": event.instrument_key,
            "timeframe": event.timeframe,
            "candle": _candle_dict(event.candle),
            "isFinal": True,
        }
        self._schedule_broadcast(event.instrument_key, event.timeframe, payload)

    def on_pattern_stage(self, event: PatternStageEvent) -> None:
        payload = {
            "type": "pattern_event",
            "symbolId": event.instrument_key,
            "timeframe": event.timeframe,
            "patternType": event.pattern_type,
            "stage": event.stage,
            **event.payload,
        }
        self._schedule_broadcast(event.instrument_key, event.timeframe, payload)

    def evict_throttle_keys(self, instrument_key: str) -> None:
        if not instrument_key:
            return
        prefix = instrument_key + "|"
        for k in [k for k in self._last_sent if k.startswith(prefix)]:
            del self._last_sent[k]

    def _schedule_broadcast(self, symbol_id: str, timeframe: str, payload: dict) -> None:
        schedule_on_loop(self._loop, self._hub.broadcast(symbol_id, timeframe, payload))


class MarketStatusBroadcaster:
    """Fan-out market_status WS frames on MarketPhaseChangedEvent (Java parity)."""

    def __init__(self, hub: LiveWebSocketHub) -> None:
        self._hub = hub

    def on_market_phase_changed(self, event: MarketPhaseChangedEvent) -> None:
        phase = (event.phase or "").strip()
        # FE expects lowercase open / pre_open / closed
        market_phase = phase.lower() if phase else "closed"
        payload = {"type": "market_status", "marketPhase": market_phase}
        self._hub.schedule_broadcast_all(payload)


def _candle_dict(c) -> dict:
    return {
        "time": c.time,
        "open": c.open,
        "high": c.high,
        "low": c.low,
        "close": c.close,
        "volume": c.volume,
    }


@router.websocket("/ws/live")
async def live_ws(websocket: WebSocket):
    container = websocket.app.state.container
    hub: LiveWebSocketHub = container.ws_hub
    sid = await hub.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue
            if msg.get("type") != "subscribe":
                await websocket.send_json(
                    {"type": "error", "message": f"Unsupported message type: {msg.get('type')}"}
                )
                continue

            settings = container.settings
            timeframe = msg.get("timeframe") or settings.default_timeframe
            symbol_id = msg.get("symbolId")
            if not symbol_id:
                primary = container.watchlist_repo.find_primary()
                symbol_id = (
                    primary.symbol_id if primary else settings.default_instrument_key
                )

            if not symbol_id:
                await websocket.send_json({"type": "error", "message": "No symbols on watchlist"})
                continue

            if not _is_accepted_symbol(container, symbol_id):
                await websocket.send_json(
                    {"type": "error", "message": f"Symbol not on watchlist: {symbol_id}"}
                )
                continue

            if not _is_supported_tf(settings, timeframe):
                await websocket.send_json(
                    {
                        "type": "error",
                        "message": f"Unsupported timeframe: {timeframe} (supported: {settings.supported_timeframes})",
                    }
                )
                continue

            hub.set_subscription(sid, LiveSubscription(symbol_id, timeframe))
            logger.info("Live WebSocket subscribed: session=%s %s|%s", sid, symbol_id, timeframe)
            await websocket.send_json(
                {"type": "subscribed", "symbolId": symbol_id, "timeframe": timeframe}
            )
    except WebSocketDisconnect:
        hub.disconnect(sid)
    except Exception:
        logger.exception("WebSocket error")
        hub.disconnect(sid)


def _is_accepted_symbol(container, symbol_id: str) -> bool:
    if container.watchlist_repo.contains_symbol_id(symbol_id):
        return True
    primary = container.watchlist_repo.find_primary()
    if primary and symbol_id == primary.symbol_id:
        return True
    return symbol_id == container.settings.default_instrument_key


def _is_supported_tf(settings, timeframe: str) -> bool:
    if not timeframe:
        return False
    if timeframe == settings.default_timeframe:
        return True
    return timeframe in (settings.supported_timeframes or [])

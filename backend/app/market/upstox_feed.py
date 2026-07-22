from __future__ import annotations

import asyncio
import json
import logging
import ssl
import threading
from typing import Callable

import httpx
import websockets

from app.config import Settings
from app.market.index_volume import IndexVolumeSupport, normalize_ts_ms
from app.market.market_status import MarketStatusService
from app.market.models import Tick

logger = logging.getLogger(__name__)

AUTHORIZE_URL = "https://api.upstox.com/v3/feed/market-data-feed/authorize"
FEED_URL = "wss://api.upstox.com/v3/feed/market-data-feed"


class UpstoxFeedClient:
    """
    Long-lived Upstox Market Data Feed V3 client (KD23).
    Connects via authorize redirect or direct WS with Bearer token;
    decodes protobuf FeedResponse when generated stubs are available,
    otherwise falls back to JSON if the server sends it.
    """

    def __init__(
        self,
        settings: Settings,
        market_status: MarketStatusService,
        loop: asyncio.AbstractEventLoop | None = None,
    ) -> None:
        self._settings = settings
        self._market_status = market_status
        self._loop = loop
        self._lock = threading.RLock()
        self._subscribed: set[str] = set()
        self._tick_handler: Callable[[Tick], None] | None = None
        self._index_volume = IndexVolumeSupport()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._connected = False
        self._ws_send: Callable | None = None
        self._pb2 = _try_load_pb2()

    def set_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribed_keys(self) -> set[str]:
        with self._lock:
            return set(self._subscribed)

    def is_connected(self) -> bool:
        return self._connected

    def connect(self, instrument_keys: set[str], handler: Callable[[Tick], None]) -> None:
        if handler is None:
            raise ValueError("Tick handler is required")
        if instrument_keys is None:
            raise ValueError("instrument_keys is required")
        with self._lock:
            self._tick_handler = handler
            # Already live: only subscribe missing keys (no reconnect/recreate)
            if self._thread and self._thread.is_alive():
                missing = {k for k in instrument_keys if k and k.strip()} - self._subscribed
                if missing:
                    self._subscribe_internal(missing)
                return
            self._subscribed = {k for k in instrument_keys if k and str(k).strip()}
            self._index_volume.clear_all()
            self._stop.clear()
            self._thread = threading.Thread(target=self._run_loop, name="upstox-feed", daemon=True)
            self._thread.start()

    def subscribe(self, instrument_keys: set[str]) -> None:
        if not instrument_keys:
            return
        with self._lock:
            self._subscribe_internal(instrument_keys)

    def unsubscribe(self, instrument_keys: set[str]) -> None:
        if not instrument_keys:
            return
        with self._lock:
            to_remove = {k for k in instrument_keys if k in self._subscribed}
            if not to_remove:
                return
            # Optimistic remove; restore on wire failure when connected
            self._subscribed -= to_remove
            if self._connected:
                try:
                    self._send_unsubscribe(to_remove)
                    for k in to_remove:
                        self._index_volume.clear(k)
                    logger.info("Upstox live feed unsubscribed: %s", to_remove)
                except Exception as e:
                    self._subscribed |= to_remove
                    logger.warning(
                        "Upstox unsubscribe failed for %s (local set restored): %s",
                        to_remove,
                        e,
                    )
            else:
                for k in to_remove:
                    self._index_volume.clear(k)

    def _subscribe_internal(self, instrument_keys: set[str]) -> None:
        to_add = {
            k
            for k in instrument_keys
            if k and str(k).strip() and k not in self._subscribed
        }
        if not to_add:
            return
        # No live socket yet: record intent for next session open
        if not self._connected:
            self._subscribed |= to_add
            return
        try:
            self._send_subscribe(to_add)
            self._subscribed |= to_add
            logger.info("Upstox live feed subscribed: %s", to_add)
        except Exception as e:
            # Do not retain keys the wire rejected — allows later retry
            logger.warning(
                "Upstox subscribe failed for %s (not retained locally): %s", to_add, e
            )

    def disconnect(self) -> None:
        self._stop.set()
        self._connected = False
        self._ws_send = None
        with self._lock:
            self._subscribed.clear()
            self._index_volume.clear_all()
            self._tick_handler = None
        self._market_status.set_live_feed_connected(False)
        t = self._thread
        if t and t.is_alive():
            t.join(timeout=5)
        self._thread = None

    def _run_loop(self) -> None:
        asyncio.run(self._async_main())

    async def _async_main(self) -> None:
        while not self._stop.is_set():
            try:
                await self._session()
            except Exception:
                logger.exception("Upstox feed session error; reconnecting in 3s")
                self._market_status.set_live_feed_connected(False)
                self._connected = False
                await asyncio.sleep(3)

    async def _session(self) -> None:
        token = self._settings.upstox_access_token
        if not token:
            logger.warning("No UPSTOX_ACCESS_TOKEN; feed idle")
            await asyncio.sleep(5)
            return

        ws_url = await self._resolve_ws_url(token)
        # Official Upstox example: connect to authorized_redirect_uri only (code in URL).
        # Subscribe must be a *binary* WS frame of UTF-8 JSON (not text frame).
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

        async with websockets.connect(
            ws_url,
            ssl=ssl_ctx,
            max_size=8 * 1024 * 1024,
            ping_interval=20,
            ping_timeout=20,
        ) as ws:
            self._connected = True
            self._market_status.set_live_feed_connected(True)
            logger.info("Upstox V3 feed connected")

            loop = asyncio.get_running_loop()
            send_errors: list[Exception] = []

            def send_json(msg: dict) -> None:
                # Binary frame required by Market Data Feed V3
                payload = json.dumps(msg).encode("utf-8")
                fut = asyncio.run_coroutine_threadsafe(ws.send(payload), loop)
                try:
                    fut.result(timeout=5)
                except Exception as e:
                    send_errors.append(e)
                    logger.exception("Failed to send feed message")
                    raise

            self._ws_send = send_json
            await asyncio.sleep(1.0)
            # Re-apply full local set after open (covers reconnect path)
            with self._lock:
                keys = set(self._subscribed)
            if keys:
                payload = json.dumps(self._subscribe_payload(keys)).encode("utf-8")
                await ws.send(payload)
                logger.info("Subscribed live feed keys=%s (reconnect-safe reapply)", len(keys))

            msg_count = 0
            try:
                async for message in ws:
                    if self._stop.is_set():
                        break
                    self._handle_message(message)
                    msg_count += 1
                    if msg_count <= 3 or msg_count % 200 == 0:
                        logger.debug(
                            "Upstox feed message #%s (%s bytes)",
                            msg_count,
                            len(message) if message else 0,
                        )
            finally:
                self._connected = False
                self._ws_send = None
                self._market_status.set_live_feed_connected(False)

    async def _resolve_ws_url(self, token: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.get(
                    AUTHORIZE_URL,
                    headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
                )
                if r.status_code == 200:
                    data = r.json().get("data") or {}
                    uri = data.get("authorized_redirect_uri") or data.get("authorizedRedirectUri")
                    if uri:
                        return uri
        except Exception:
            logger.debug("Authorize redirect failed; using default feed URL", exc_info=True)
        return FEED_URL

    def _subscribe_payload(self, keys: set[str]) -> dict:
        return {
            "guid": "tip2",
            "method": "sub",
            "data": {
                "mode": "full",
                "instrumentKeys": sorted(keys),
            },
        }

    def _unsubscribe_payload(self, keys: set[str]) -> dict:
        return {
            "guid": "tip2",
            "method": "unsub",
            "data": {
                "instrumentKeys": sorted(keys),
            },
        }

    def _send_subscribe(self, keys: set[str]) -> None:
        if not self._ws_send:
            raise RuntimeError("SOCKET_NOT_OPEN")
        self._ws_send(self._subscribe_payload(keys))

    def _send_unsubscribe(self, keys: set[str]) -> None:
        if not self._ws_send:
            raise RuntimeError("SOCKET_NOT_OPEN")
        self._ws_send(self._unsubscribe_payload(keys))

    def _handle_message(self, message: bytes | str) -> None:
        if isinstance(message, str):
            try:
                data = json.loads(message)
                self._handle_json(data)
            except json.JSONDecodeError:
                logger.debug("Non-JSON text feed message ignored")
            return

        if self._pb2 is not None:
            try:
                feed = self._pb2.FeedResponse()
                feed.ParseFromString(message)
                self._handle_protobuf(feed)
                return
            except Exception:
                logger.debug("Protobuf parse failed", exc_info=True)

        # Try JSON bytes
        try:
            data = json.loads(message.decode("utf-8"))
            self._handle_json(data)
        except Exception:
            logger.debug("Unhandled binary feed message (%s bytes)", len(message))

    def _handle_json(self, data: dict) -> None:
        # market_info
        if data.get("type") == "market_info" or "marketInfo" in data or "market_info" in data:
            info = data.get("marketInfo") or data.get("market_info") or {}
            seg = info.get("segmentStatus") or info.get("segment_status") or {}
            self._market_status.update_from_segment_status(seg)
            return
        feeds = data.get("feeds") or {}
        for key, feed in feeds.items():
            tick = self._extract_tick_json(key, feed)
            if tick and self._tick_handler:
                self._dispatch(tick)

    def _handle_protobuf(self, feed_resp) -> None:
        # type: 0=initial_feed, 1=live_feed, 2=market_info
        ftype = int(getattr(feed_resp, "type", 0) or 0)
        if ftype == 2:  # market_info
            mi = getattr(feed_resp, "marketInfo", None)
            if mi is not None:
                seg = dict(getattr(mi, "segmentStatus", {}) or {})
                mapped = {}
                for k, v in seg.items():
                    # Keep enum int/name — map_segment_status handles both.
                    # Do NOT only pass .name; ints are the common protobuf form.
                    if hasattr(v, "name") and isinstance(getattr(v, "name", None), str):
                        mapped[k] = v.name
                    else:
                        mapped[k] = v
                self._market_status.update_from_segment_status(mapped)
                logger.info(
                    "Market phase from feed market_info: %s (segments=%s)",
                    self._market_status.get_market_phase(),
                    {kk: (getattr(vv, "name", None) or vv) for kk, vv in list(seg.items())[:4]},
                )
            return

        feeds = getattr(feed_resp, "feeds", None) or {}
        # protobuf map may need .items()
        try:
            items = feeds.items()
        except Exception:
            items = []
        for key, feed in items:
            tick = self._extract_tick_pb(key, feed)
            if tick and self._tick_handler:
                self._dispatch(tick)

    def _extract_tick_json(self, instrument_key: str, feed: dict) -> Tick | None:
        ff = feed.get("fullFeed") or feed.get("full_feed") or {}
        market_ff = ff.get("marketFF") or ff.get("market_ff")
        if market_ff:
            ltpc = market_ff.get("ltpc") or {}
            ltp = ltpc.get("ltp")
            if ltp is None:
                return None
            return Tick(
                instrument_key,
                float(ltp),
                int(market_ff.get("vtt") or 0),
                normalize_ts_ms(int(ltpc.get("ltt") or 0)),
            )
        index_ff = ff.get("indexFF") or ff.get("index_ff")
        if index_ff:
            ltpc = index_ff.get("ltpc") or {}
            ltp = ltpc.get("ltp")
            if ltp is None:
                return None
            ohlc = (index_ff.get("marketOHLC") or index_ff.get("market_ohlc") or {}).get("ohlc") or []
            vol = self._index_volume.resolve(instrument_key, ohlc)
            return Tick(
                instrument_key,
                float(ltp),
                vol.volume_traded_today,
                normalize_ts_ms(int(ltpc.get("ltt") or 0)),
            )
        return None

    def _extract_tick_pb(self, instrument_key: str, feed) -> Tick | None:
        # Prefer fullFeed oneof; fall back to ltpc-only feed
        which_feed = feed.WhichOneof("FeedUnion") if hasattr(feed, "WhichOneof") else None
        if which_feed == "ltpc" or (getattr(feed, "ltpc", None) and which_feed is None):
            ltpc = feed.ltpc
            if ltpc is None:
                return None
            return Tick(
                instrument_key,
                float(ltpc.ltp),
                0,
                normalize_ts_ms(int(ltpc.ltt)),
            )

        full = getattr(feed, "fullFeed", None)
        if full is None and which_feed != "fullFeed":
            # firstLevelWithGreeks
            greeks = getattr(feed, "firstLevelWithGreeks", None)
            if greeks is not None and getattr(greeks, "ltpc", None) is not None:
                ltpc = greeks.ltpc
                return Tick(
                    instrument_key,
                    float(ltpc.ltp),
                    int(getattr(greeks, "vtt", 0) or 0),
                    normalize_ts_ms(int(ltpc.ltt)),
                )
            return None

        which = full.WhichOneof("FullFeedUnion") if hasattr(full, "WhichOneof") else None
        if which == "marketFF" or (which is None and getattr(full, "marketFF", None)):
            market_ff = full.marketFF
            ltpc = market_ff.ltpc
            if ltpc is None:
                return None
            return Tick(
                instrument_key,
                float(ltpc.ltp),
                int(market_ff.vtt or 0),
                normalize_ts_ms(int(ltpc.ltt)),
            )
        if which == "indexFF" or getattr(full, "indexFF", None):
            index_ff = full.indexFF
            if index_ff is None:
                return None
            ltpc = index_ff.ltpc
            if ltpc is None:
                return None
            ohlc_msg = getattr(index_ff, "marketOHLC", None)
            bars = list(ohlc_msg.ohlc) if ohlc_msg is not None else []
            vol = self._index_volume.resolve(instrument_key, bars)
            return Tick(
                instrument_key,
                float(ltpc.ltp),
                vol.volume_traded_today,
                normalize_ts_ms(int(ltpc.ltt)),
            )
        return None

    def _dispatch(self, tick: Tick) -> None:
        handler = self._tick_handler
        if not handler:
            return
        # Support both bare callables and objects with on_tick(tick)
        cb = handler
        if not callable(handler) and hasattr(handler, "on_tick"):
            cb = handler.on_tick
        if self._loop is not None:
            try:
                self._loop.call_soon_threadsafe(cb, tick)
            except Exception:
                # Fallback: process on feed thread (candle engine is thread-safe)
                try:
                    cb(tick)
                except Exception:
                    logger.exception("Tick handler failed")
        else:
            try:
                cb(tick)
            except Exception:
                logger.exception("Tick handler failed")


def _try_load_pb2():
    try:
        from app.market import market_data_feed_pb2 as pb2  # type: ignore

        logger.info("Upstox MarketDataFeed protobuf stubs loaded")
        return pb2
    except Exception as e:
        logger.warning("Protobuf stubs unavailable (%s); JSON feed decode only", e)
        return None

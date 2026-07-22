from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone

from app.events import EventBus, MarketPhaseChangedEvent
from app.market.nse_clock import BootstrapStatus, MarketPhase, phase_from_clock

logger = logging.getLogger(__name__)

SEGMENT_NSE_EQ = "NSE_EQ"
SEGMENT_NSE_INDEX = "NSE_INDEX"
FEED_PHASE_FRESHNESS = timedelta(minutes=2)

# Upstox MarketDataFeed MarketStatus (name + protobuf int):
# PRE_OPEN_START=0, PRE_OPEN_END=1, NORMAL_OPEN=2, NORMAL_CLOSE=3,
# CLOSING_START=4, CLOSING_END=5
_STATUS_MAP: dict[str | int, MarketPhase] = {
    # names
    "PRE_OPEN_START": MarketPhase.PRE_OPEN,
    "PRE_OPEN_END": MarketPhase.PRE_OPEN,
    "NORMAL_OPEN": MarketPhase.OPEN,
    "NORMAL_CLOSE": MarketPhase.CLOSED,
    "CLOSING_START": MarketPhase.CLOSED,
    "CLOSING_END": MarketPhase.CLOSED,
    # common aliases
    "OPEN": MarketPhase.OPEN,
    "PRE_OPEN": MarketPhase.PRE_OPEN,
    "CLOSED": MarketPhase.CLOSED,
    # protobuf enum numbers (critical — feed often delivers ints, not names)
    0: MarketPhase.PRE_OPEN,  # PRE_OPEN_START
    1: MarketPhase.PRE_OPEN,  # PRE_OPEN_END
    2: MarketPhase.OPEN,  # NORMAL_OPEN
    3: MarketPhase.CLOSED,  # NORMAL_CLOSE
    4: MarketPhase.CLOSED,  # CLOSING_START
    5: MarketPhase.CLOSED,  # CLOSING_END
}


class MarketStatusService:
    def __init__(self, event_bus: EventBus | None = None) -> None:
        self._event_bus = event_bus
        self._lock = threading.RLock()
        self._market_phase = phase_from_clock()
        self._bootstrap_status = BootstrapStatus.PENDING
        self._bootstrap_error: str | None = None
        self._last_seeded_at: datetime | None = None
        self._live_feed_connected = False
        self._seeded_candle_count = 0
        self._last_feed_phase_at: datetime | None = None

    def get_market_phase(self) -> MarketPhase:
        return self._market_phase

    def get_bootstrap_status(self) -> BootstrapStatus:
        return self._bootstrap_status

    def get_bootstrap_error(self) -> str | None:
        return self._bootstrap_error

    def get_last_seeded_at(self) -> datetime | None:
        return self._last_seeded_at

    def is_live_feed_connected(self) -> bool:
        return self._live_feed_connected

    def get_seeded_candle_count(self) -> int:
        return self._seeded_candle_count

    def set_bootstrap_pending(self) -> None:
        with self._lock:
            self._bootstrap_status = BootstrapStatus.PENDING
            self._bootstrap_error = None

    def set_bootstrap_ready(self, candle_count: int) -> None:
        with self._lock:
            self._bootstrap_status = BootstrapStatus.READY
            self._bootstrap_error = None
            self._seeded_candle_count = candle_count
            self._last_seeded_at = datetime.now(timezone.utc)

    def set_bootstrap_failed(self, error: str) -> None:
        with self._lock:
            self._bootstrap_status = BootstrapStatus.FAILED
            self._bootstrap_error = error

    def set_live_feed_connected(self, connected: bool) -> None:
        self._live_feed_connected = connected

    def update_from_segment_status(self, segment_status: dict | None) -> None:
        status = select_segment_status(segment_status)
        if status is None:
            return
        phase = map_segment_status(status)
        if phase is None:
            logger.debug("Ignoring unmapped segment status: %r", status)
            return
        self._last_feed_phase_at = datetime.now(timezone.utc)
        self._set_market_phase(phase)

    def refresh_phase_from_clock(self) -> None:
        clock_phase = phase_from_clock()
        feed_at = self._last_feed_phase_at
        feed_fresh = (
            self._live_feed_connected
            and feed_at is not None
            and feed_at > datetime.now(timezone.utc) - FEED_PHASE_FRESHNESS
        )
        if feed_fresh:
            # Clock always wins for session end / holiday.
            if clock_phase == MarketPhase.CLOSED:
                logger.info(
                    "Phase clock: forcing CLOSED (feed was fresh but wall-clock session ended/holiday)"
                )
                self._set_market_phase(MarketPhase.CLOSED)
            elif (
                clock_phase == MarketPhase.OPEN
                and self._market_phase == MarketPhase.CLOSED
            ):
                # Recover from a bad feed CLOSED while session is clearly open
                # (e.g. mis-mapped enum int). Prefer clock OPEN over stale CLOSED.
                logger.info(
                    "Phase clock: overriding feed CLOSED → OPEN (clock OPEN, session active)"
                )
                self._set_market_phase(MarketPhase.OPEN)
            return
        self._set_market_phase(clock_phase)

    def _set_market_phase(self, phase: MarketPhase) -> None:
        previous = self._market_phase
        self._market_phase = phase
        if previous != phase:
            logger.info("Market phase changed: %s → %s", previous, phase)
            if self._event_bus:
                self._event_bus.publish(MarketPhaseChangedEvent(phase.value))


def select_segment_status(segment_status: dict | None):
    if not segment_status:
        return None
    if SEGMENT_NSE_EQ in segment_status:
        return segment_status[SEGMENT_NSE_EQ]
    return segment_status.get(SEGMENT_NSE_INDEX)


def map_segment_status(status) -> MarketPhase | None:
    """Map Upstox segment status → phase. Returns None if unknown (do not update)."""
    if status is None:
        return None
    if isinstance(status, MarketPhase):
        return status

    # int / enum value (protobuf often delivers NORMAL_OPEN as 2)
    if isinstance(status, int) and not isinstance(status, bool):
        return _STATUS_MAP.get(status)

    # protobuf enum instance: .name / .value
    name = getattr(status, "name", None)
    if isinstance(name, str) and name:
        hit = _STATUS_MAP.get(name) or _STATUS_MAP.get(name.upper())
        if hit is not None:
            return hit
    value = getattr(status, "value", None)
    if isinstance(value, int) and not isinstance(value, bool):
        hit = _STATUS_MAP.get(value)
        if hit is not None:
            return hit

    if isinstance(status, str):
        key = status.strip()
        hit = _STATUS_MAP.get(key) or _STATUS_MAP.get(key.upper())
        if hit is not None:
            return hit
        # numeric string "2"
        if key.isdigit():
            return _STATUS_MAP.get(int(key))
        return None

    # last resort: str(status) may be "2" or "MarketStatus.NORMAL_OPEN"
    text = str(status).strip()
    if text.isdigit():
        return _STATUS_MAP.get(int(text))
    if "." in text:
        text = text.rsplit(".", 1)[-1]
    return _STATUS_MAP.get(text) or _STATUS_MAP.get(text.upper())

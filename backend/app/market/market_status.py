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

# Upstox market_info segment status → MarketPhase
_STATUS_MAP = {
    "NORMAL_OPEN": MarketPhase.OPEN,
    0: MarketPhase.OPEN,  # enum ordinal fallbacks if numeric
    "PRE_OPEN_START": MarketPhase.PRE_OPEN,
    "PRE_OPEN_END": MarketPhase.PRE_OPEN,
    "NORMAL_CLOSE": MarketPhase.CLOSED,
    "CLOSING_START": MarketPhase.CLOSED,
    "CLOSING_END": MarketPhase.CLOSED,
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
        self._last_feed_phase_at = datetime.now(timezone.utc)
        self._set_market_phase(map_segment_status(status))

    def refresh_phase_from_clock(self) -> None:
        clock_phase = phase_from_clock()
        feed_at = self._last_feed_phase_at
        feed_fresh = (
            self._live_feed_connected
            and feed_at is not None
            and feed_at > datetime.now(timezone.utc) - FEED_PHASE_FRESHNESS
        )
        if feed_fresh:
            if clock_phase == MarketPhase.CLOSED:
                logger.info(
                    "Phase clock: forcing CLOSED (feed was fresh but wall-clock session ended/holiday)"
                )
                self._set_market_phase(MarketPhase.CLOSED)
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


def map_segment_status(status) -> MarketPhase:
    if isinstance(status, MarketPhase):
        return status
    if isinstance(status, str):
        return _STATUS_MAP.get(status, MarketPhase.CLOSED)
    # protobuf enum may expose name
    name = getattr(status, "name", None) or str(status)
    return _STATUS_MAP.get(name, MarketPhase.CLOSED)

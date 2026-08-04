from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone

from app.config import Settings
from app.events import EventBus, MarketPhaseChangedEvent, PatternStageEvent as BusPatternEvent
from app.patterns.active_store import ActiveInstanceStore
from app.patterns.lifecycle_support import expire
from app.patterns.models import PatternStage

logger = logging.getLogger(__name__)


def tracks_sessions_on_close(timeframe: str) -> bool:
    return timeframe in ("1h", "4h")


def max_sessions_for(settings: Settings, timeframe: str) -> int:
    if timeframe == "1h":
        return settings.expiry_max_sessions_1h
    if timeframe == "4h":
        return settings.expiry_max_sessions_4h
    return 999


def max_candles_for(settings: Settings, timeframe: str) -> int | None:
    if timeframe == "1h":
        return settings.expiry_max_candles_1h
    if timeframe == "4h":
        return settings.expiry_max_candles_4h
    if timeframe == "1d":
        return settings.expiry_max_candles_1d
    return None


class SessionExpiryReconciler:
    """Session-close expiry for short TFs; session counters for 1h/4h multi-day setups."""

    def __init__(
        self,
        settings: Settings,
        active_store: ActiveInstanceStore,
        journal,
        candle_engine,
        event_bus: EventBus | None = None,
    ) -> None:
        self._settings = settings
        self._store = active_store
        self._journal = journal
        self._engine = candle_engine
        self._events = event_bus

    def on_phase_changed(self, event: MarketPhaseChangedEvent) -> None:
        if not self._settings.pattern_enabled:
            return
        if event.phase != "CLOSED":
            return
        self.expire_on_session_close()

    def expire_on_session_close(self) -> int:
        now = datetime.now(timezone.utc)
        session_tfs = set(self._settings.expiry_session_close_timeframes or [])
        all_open = self._store.all_open()
        by_series: dict[tuple[str, str], list] = defaultdict(list)
        for p in all_open:
            by_series[(p.symbol_id, p.timeframe)].append(p)

        expired = 0
        for (sid, tf), patterns in by_series.items():
            still = []
            for p in patterns:
                if p.is_terminal():
                    continue
                if tf in session_tfs:
                    last = self._last_closed(p)
                    events = expire(p, last, "session_end", now, False)
                    self._journal.apply_events(p, events)
                    self._publish(p, events)
                    expired += 1
                    continue
                if tracks_sessions_on_close(tf):
                    p.sessions_seen += 1
                    self._journal.apply_events(p, [])
                    if p.sessions_seen >= max_sessions_for(self._settings, tf):
                        last = self._last_closed(p)
                        events = expire(p, last, "max_sessions", now, False)
                        self._journal.apply_events(p, events)
                        self._publish(p, events)
                        expired += 1
                        continue
                    still.append(p)
                    continue
                still.append(p)
            self._store.replace_series(sid, tf, still)

        # Also age-expire by max candles for multi-day TFs
        expired += self.expire_by_max_candles(now)
        logger.info("Session close: expired %s open pattern instance(s)", expired)
        return expired

    def expire_by_max_candles(self, now: datetime | None = None) -> int:
        now = now or datetime.now(timezone.utc)
        expired = 0
        for p in list(self._store.all_open()):
            if p.is_terminal():
                continue
            max_c = max_candles_for(self._settings, p.timeframe)
            if max_c is None:
                continue
            if p.duration_candles >= max_c:
                last = self._last_closed(p)
                events = expire(p, last, "max_candles", now, False)
                self._journal.apply_events(p, events)
                self._publish(p, events)
                # remove from store
                opens = [
                    x
                    for x in self._store.get_open(p.symbol_id, p.timeframe)
                    if x.id != p.id and not x.is_terminal()
                ]
                self._store.replace_series(p.symbol_id, p.timeframe, opens)
                expired += 1
        return expired

    def _last_closed(self, p):
        closed = self._engine.get_closed_candles(p.symbol_id, p.timeframe)
        return closed[-1] if closed else None

    def _publish(self, pattern, events) -> None:
        if not self._events:
            return
        stages = set(self._settings.ws_broadcast_stages)
        for e in events:
            if e.stage.value not in stages:
                continue
            self._events.publish(
                BusPatternEvent(
                    instrument_key=pattern.symbol_id,
                    timeframe=pattern.timeframe,
                    pattern_type=pattern.pattern_type.value,
                    stage=e.stage.value,
                    payload={
                        "id": f"{pattern.id}:{e.stage.value}:{e.candle_time}:{e.price}",
                        "instanceId": str(pattern.id),
                        "referenceLevel": pattern.reference_level,
                        "price": e.price,
                        "time": e.candle_time,
                        "direction": pattern.direction.value,
                        "entryPrice": pattern.entry_price,
                        "stopLevel": pattern.stop_level,
                        "targetLevel": pattern.target_level,
                        "atrAtDetect": pattern.atr_at_detect,
                        "status": pattern.status.value,
                    },
                )
            )

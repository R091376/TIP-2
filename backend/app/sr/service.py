from __future__ import annotations

import logging
import threading
from datetime import date, datetime

from app.events import CandleUpdatedEvent
from app.market.candle_boundary import (
    candle_ist_date,
    floor_to_candle_start_epoch_second,
)
from app.market.nse_clock import MarketPhase, is_trading_day, phase_from_clock
from app.patterns.research_filters import today_ist
from app.sr.models import FREEZE_FIRST_RTH, FREEZE_MID_SESSION, METHOD_WOODIE_OPEN_V1
from app.sr.store import DailySrStore
from app.sr.woodie import compute_woodie_open_v1

logger = logging.getLogger(__name__)


class DailySrService:
    def __init__(self, settings, candle_engine, store: DailySrStore) -> None:
        self._settings = settings
        self._engine = candle_engine
        self._store = store
        self._lock = threading.Lock()
        self._frozen: set[tuple[str, date]] = set()
        self._inflight: set[tuple[str, date]] = set()

    def on_candle_updated(self, ev: CandleUpdatedEvent) -> None:
        if not getattr(self._settings, "pattern_sr_enabled", True):
            return
        if phase_from_clock() != MarketPhase.OPEN:
            return
        day = candle_ist_date(int(ev.candle.time))
        if not is_trading_day(day):
            return
        if (ev.instrument_key, day) in self._frozen:
            return
        today_open, open_ts = self._resolve_today_open_from_event(ev)
        if today_open is None:
            return
        self._try_freeze(
            ev.instrument_key, day, today_open, open_ts, FREEZE_FIRST_RTH
        )

    def ensure_today(self, symbol_id: str, *, session_date: date | None = None) -> None:
        if not getattr(self._settings, "pattern_sr_enabled", True):
            return
        day = session_date or today_ist()
        if not is_trading_day(day):
            return
        if (symbol_id, day) in self._frozen:
            return
        today_open, open_ts, src = self._resolve_today_open_recover(symbol_id, day)
        if today_open is None:
            return
        self._try_freeze(symbol_id, day, today_open, open_ts, src)

    def ensure_all_active(self) -> None:
        if not getattr(self._settings, "pattern_sr_enabled", True):
            return
        day = today_ist()
        if is_trading_day(day):
            for sid in self._store.list_frozen_for_date(day, METHOD_WOODIE_OPEN_V1):
                self._frozen.add((sid, day))
        # Callers pass watchlist after seed; we also accept any already-seeded engine keys.
        # Watchlist-driven ensure is done from bootstrap_symbol / this method's caller
        # with explicit symbol lists via ensure_today.

    def ensure_levels(self, symbol_id: str, session_date: date):
        """Return frozen levels, computing them if missing."""
        hit = self._store.get(symbol_id, session_date, METHOD_WOODIE_OPEN_V1)
        if hit is not None:
            self._frozen.add((symbol_id, session_date))
            return hit
        self.ensure_today(symbol_id, session_date=session_date)
        return self._store.get(symbol_id, session_date, METHOD_WOODIE_OPEN_V1)

    def _try_freeze(
        self,
        symbol: str,
        day: date,
        today_open: float,
        open_ts: int | None,
        source: str,
    ) -> None:
        key = (symbol, day)
        with self._lock:
            if key in self._frozen or key in self._inflight:
                return
            self._inflight.add(key)
        try:
            prev = self.last_closed_daily_before(symbol, day)
            if prev is None:
                logger.warning(
                    "Woodie SR freeze skipped missing_1d symbol=%s session_date=%s",
                    symbol,
                    day,
                )
                return
            levels = compute_woodie_open_v1(
                prev.high, prev.low, prev.close, today_open, prev_open=prev.open
            )
            inserted = self._store.insert_if_absent(
                symbol,
                day,
                levels,
                prev_candle_time=int(prev.time),
                today_open_candle_time=open_ts,
                freeze_source=source,
            )
            self._frozen.add(key)
            if inserted:
                logger.info(
                    "Woodie SR freeze created symbol=%s session_date=%s today_open=%s pp=%s source=%s",
                    symbol,
                    day,
                    today_open,
                    levels.pp,
                    source,
                )
        except Exception:
            logger.exception("Woodie SR freeze failed for %s %s", symbol, day)
        finally:
            with self._lock:
                self._inflight.discard(key)

    def last_closed_daily_before(self, symbol: str, session_date: date):
        closed = self._engine.get_closed_candles(symbol, "1d")
        for bar in reversed(closed):
            if candle_ist_date(int(bar.time)) < session_date:
                return bar
        return None

    def daily_bar_for_session(self, symbol: str, day: date):
        current = self._engine.get_current_candle(symbol, "1d")
        if current is not None and candle_ist_date(int(current.time)) == day:
            return current
        for bar in reversed(self._engine.get_closed_candles(symbol, "1d")):
            if candle_ist_date(int(bar.time)) == day:
                return bar
        return None

    def _session_open_epoch(self, day: date, interval_minutes: int) -> int:
        from app.market.candle_boundary import NSE_ZONE

        dt = datetime(day.year, day.month, day.day, 9, 15, tzinfo=NSE_ZONE)
        return floor_to_candle_start_epoch_second(int(dt.timestamp() * 1000), interval_minutes)

    def _bar_open_at(self, symbol: str, timeframe: str, day: date):
        want = self._session_open_epoch(day, {"1m": 1, "5m": 5, "15m": 15}[timeframe])
        current = self._engine.get_current_candle(symbol, timeframe)
        if current is not None and int(current.time) == want:
            return current.open, int(current.time)
        for bar in reversed(self._engine.get_closed_candles(symbol, timeframe)):
            if int(bar.time) == want:
                return bar.open, int(bar.time)
        return None, None

    def _open_freeze_timeframes(self) -> list[str]:
        """Finest-first TFs that can freeze today's Woodie open."""
        supported = getattr(self._settings, "supported_timeframes", None)
        candidates = ("1m", "5m", "15m")
        if supported is None:
            return list(candidates)
        return [tf for tf in candidates if tf in supported]

    def _resolve_today_open_from_event(self, ev: CandleUpdatedEvent):
        freeze_tfs = self._open_freeze_timeframes()
        if not freeze_tfs:
            return None, None
        finest = freeze_tfs[0]
        if ev.timeframe != finest:
            return None, None
        minutes = {"1m": 1, "5m": 5, "15m": 15}[finest]
        day = candle_ist_date(int(ev.candle.time))
        want = self._session_open_epoch(day, minutes)
        if int(ev.candle.time) != want:
            return None, None
        return float(ev.candle.open), int(ev.candle.time)

    def _resolve_today_open_recover(self, symbol_id: str, day: date):
        for tf in ("1m", "5m", "15m"):
            opn, ts = self._bar_open_at(symbol_id, tf, day)
            if opn is not None:
                return float(opn), ts, FREEZE_MID_SESSION
        daily = self.daily_bar_for_session(symbol_id, day)
        if daily is not None:
            return float(daily.open), int(daily.time), FREEZE_MID_SESSION
        return None, None, FREEZE_MID_SESSION

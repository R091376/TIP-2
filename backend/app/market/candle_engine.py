from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field

from app.events import CandleClosedEvent, CandleUpdatedEvent, EventBus
from app.market.candle_boundary import (
    floor_to_candle_start_epoch_second,
    is_session_bar_start,
    should_emit_session_finalize,
    should_seed_as_current,
)
from app.market.models import Candle, Tick
from app.market.timeframe import parse_timeframe


def _emit_closed_bar(candle_time: int, interval_minutes: int) -> bool:
    """Daily bars always emit; intraday only for valid 09:15-anchored starts."""
    if interval_minutes >= 24 * 60:
        return True
    return is_session_bar_start(candle_time, interval_minutes)


@dataclass
class _MutableCandle:
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: int

    @classmethod
    def open_new(cls, t: int, price: float, volume_delta: int) -> _MutableCandle:
        return cls(time=t, open=price, high=price, low=price, close=price, volume=volume_delta)

    @classmethod
    def from_candle(cls, c: Candle) -> _MutableCandle:
        return cls(time=c.time, open=c.open, high=c.high, low=c.low, close=c.close, volume=c.volume)

    def update(self, price: float, volume_delta: int) -> None:
        self.high = max(self.high, price)
        self.low = min(self.low, price)
        self.close = price
        self.volume += volume_delta

    def to_candle(self) -> Candle:
        return Candle(self.time, self.open, self.high, self.low, self.close, self.volume)


@dataclass
class _SymbolState:
    lock: threading.RLock = field(default_factory=threading.RLock)
    closed_candles: list[Candle] = field(default_factory=list)
    current_candle: _MutableCandle | None = None
    last_vtt: int = 0
    last_vtt_initialized: bool = False


class CandleEngine:
    def __init__(self, event_bus: EventBus | None = None) -> None:
        self._event_bus = event_bus
        self._state: dict[str, _SymbolState] = {}
        self._map_lock = threading.RLock()

    def _state_key(self, instrument_key: str, timeframe: str) -> str:
        return f"{instrument_key}|{timeframe}"

    def _state_for(self, instrument_key: str, timeframe: str) -> _SymbolState:
        key = self._state_key(instrument_key, timeframe)
        with self._map_lock:
            if key not in self._state:
                self._state[key] = _SymbolState()
            return self._state[key]

    def seed(
        self,
        instrument_key: str,
        timeframe: str,
        candles: list[Candle],
        *,
        now_epoch_ms: int | None = None,
    ) -> None:
        interval = parse_timeframe(timeframe).interval_minutes()
        state = self._state_for(instrument_key, timeframe)
        with state.lock:
            state.closed_candles.clear()
            state.current_candle = None
            state.last_vtt = 0
            state.last_vtt_initialized = False
            if not candles:
                return
            now_ms = (
                int(now_epoch_ms)
                if now_epoch_ms is not None
                else int(time.time() * 1000)
            )
            last = candles[-1]
            # Pre-open: floor(now) is yesterday's last RTH bar — keep it closed
            # so finalize does not re-fire next-day pattern alerts.
            if should_seed_as_current(last.time, now_ms, interval):
                state.closed_candles.extend(candles[:-1])
                state.current_candle = _MutableCandle.from_candle(last)
            else:
                state.closed_candles.extend(candles)

    def process_tick(self, tick: Tick, timeframe: str) -> None:
        interval = parse_timeframe(timeframe).interval_minutes()
        state = self._state_for(tick.instrument_key, timeframe)
        pending: list[object] = []
        with state.lock:
            candle_start = floor_to_candle_start_epoch_second(tick.timestamp_ms, interval)
            volume_delta = self._compute_volume_delta(state, tick.volume_traded_today)

            if state.current_candle is None or state.current_candle.time != candle_start:
                if state.current_candle is not None:
                    closed = self._close_current(state)
                    if closed is not None and _emit_closed_bar(closed.time, interval):
                        pending.append(
                            CandleClosedEvent(tick.instrument_key, timeframe, closed)
                        )
                        pending.append(
                            CandleUpdatedEvent(
                                tick.instrument_key, timeframe, closed, True
                            )
                        )
                state.current_candle = _MutableCandle.open_new(
                    candle_start, tick.price, volume_delta
                )
            else:
                state.current_candle.update(tick.price, volume_delta)

            pending.append(
                CandleUpdatedEvent(
                    tick.instrument_key,
                    timeframe,
                    state.current_candle.to_candle(),
                    False,
                )
            )

        if self._event_bus:
            for ev in pending:
                self._event_bus.publish(ev)

    def get_current_candle(self, instrument_key: str, timeframe: str) -> Candle | None:
        key = self._state_key(instrument_key, timeframe)
        state = self._state.get(key)
        if state is None:
            return None
        with state.lock:
            return state.current_candle.to_candle() if state.current_candle else None

    def get_closed_candles(self, instrument_key: str, timeframe: str) -> list[Candle]:
        key = self._state_key(instrument_key, timeframe)
        state = self._state.get(key)
        if state is None:
            return []
        with state.lock:
            return list(state.closed_candles)

    def get_all_candles(self, instrument_key: str, timeframe: str) -> list[Candle]:
        key = self._state_key(instrument_key, timeframe)
        state = self._state.get(key)
        if state is None:
            return []
        with state.lock:
            all_c = list(state.closed_candles)
            if state.current_candle is not None:
                current = state.current_candle.to_candle()
                if not all_c:
                    all_c.append(current)
                else:
                    last_time = all_c[-1].time
                    if current.time > last_time:
                        all_c.append(current)
                    elif current.time == last_time:
                        all_c[-1] = current
            return all_c

    def evict(self, instrument_key: str) -> None:
        if not instrument_key or not instrument_key.strip():
            return
        prefix = instrument_key + "|"
        with self._map_lock:
            for k in [k for k in self._state if k.startswith(prefix)]:
                del self._state[k]

    def close_stale_open_candles(self, now_epoch_ms: int) -> int:
        """Close open candles whose bucket is strictly before floor(now).

        Mid-session this finalizes bars when the next interval starts even if
        ticks are quiet. After the cash session ends, floor(now) equals the
        *last* RTH bar start for each TF, so the final bar is never stale —
        use :meth:`finalize_session_candles` for that case.
        """
        closed_count = 0
        with self._map_lock:
            keys = list(self._state.keys())
        for key in keys:
            pipe = key.rfind("|")
            if pipe <= 0 or pipe >= len(key) - 1:
                continue
            instrument_key = key[:pipe]
            timeframe = key[pipe + 1 :]
            try:
                interval = parse_timeframe(timeframe).interval_minutes()
            except ValueError:
                continue
            current_boundary = floor_to_candle_start_epoch_second(now_epoch_ms, interval)
            state = self._state[key]
            pending: list[object] = []
            with state.lock:
                if state.current_candle is None:
                    continue
                if state.current_candle.time >= current_boundary:
                    continue
                closed = self._close_current(state)
                if closed is None:
                    continue
                closed_count += 1
                if _emit_closed_bar(closed.time, interval):
                    pending.append(CandleClosedEvent(instrument_key, timeframe, closed))
                    pending.append(
                        CandleUpdatedEvent(instrument_key, timeframe, closed, True)
                    )
            if pending and self._event_bus:
                for ev in pending:
                    self._event_bus.publish(ev)
        return closed_count

    def finalize_session_candles(self, now_epoch_ms: int | None = None) -> int:
        """Force-close every open *intraday* candle at session end / after hours.

        After 15:30 IST, ``floor_to_candle_start`` returns the last RTH bar
        start for each interval, so :meth:`close_stale_open_candles` leaves
        that bar open forever. Call this when the market phase is CLOSED
        (phase transition and periodic reconciler while closed).

        Daily bars are left open until the calendar day rolls (stale close
        next day). Safe to call repeatedly — no-op when nothing is open.

        Bars from a *prior* IST calendar day are closed silently (no
        ``CandleClosed``) so a pre-open restart cannot re-evaluate yesterday's
        last RTH bar and spam next-day pattern alerts.
        """
        now_ms = (
            int(now_epoch_ms) if now_epoch_ms is not None else int(time.time() * 1000)
        )
        closed_count = 0
        with self._map_lock:
            keys = list(self._state.keys())
        for key in keys:
            pipe = key.rfind("|")
            if pipe <= 0 or pipe >= len(key) - 1:
                continue
            instrument_key = key[:pipe]
            timeframe = key[pipe + 1 :]
            try:
                interval = parse_timeframe(timeframe).interval_minutes()
            except ValueError:
                continue
            # Daily (and multi-day) stay open across the cash session close.
            if interval >= 24 * 60:
                continue
            state = self._state[key]
            pending: list[object] = []
            with state.lock:
                if state.current_candle is None:
                    continue
                closed = self._close_current(state)
                if closed is None:
                    continue
                closed_count += 1
                if not should_emit_session_finalize(closed.time, now_ms, interval):
                    continue
                if _emit_closed_bar(closed.time, interval):
                    pending.append(CandleClosedEvent(instrument_key, timeframe, closed))
                    pending.append(
                        CandleUpdatedEvent(instrument_key, timeframe, closed, True)
                    )
            if pending and self._event_bus:
                for ev in pending:
                    self._event_bus.publish(ev)
        return closed_count

    def _close_current(self, state: _SymbolState) -> Candle | None:
        assert state.current_candle is not None
        closed = state.current_candle.to_candle()
        state.current_candle = None
        if state.closed_candles:
            last_time = state.closed_candles[-1].time
            if closed.time < last_time:
                return None
            if closed.time == last_time:
                state.closed_candles[-1] = closed
                return closed
        state.closed_candles.append(closed)
        return closed

    @staticmethod
    def _compute_volume_delta(state: _SymbolState, volume_traded_today: int) -> int:
        if volume_traded_today <= 0:
            return 0
        if not state.last_vtt_initialized:
            state.last_vtt = volume_traded_today
            state.last_vtt_initialized = True
            return 0
        if volume_traded_today < state.last_vtt:
            state.last_vtt = volume_traded_today
            return volume_traded_today
        delta = volume_traded_today - state.last_vtt
        state.last_vtt = volume_traded_today
        return delta

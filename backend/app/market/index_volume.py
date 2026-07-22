from __future__ import annotations

import threading
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ResolveResult:
    volume_traded_today: int
    day_vol: int
    i1_vol: int
    i1_ts_ms: int
    ohlc_count: int
    source: str

    @staticmethod
    def empty(source: str) -> ResolveResult:
        return ResolveResult(0, 0, 0, 0, 0, source)


@dataclass
class _OhlcBar:
    interval: str
    vol: int
    ts: int


class OneMinuteSessionTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.last_ts_ms = 0
        self.last_vol = 0
        self.closed_sum = 0
        self.initialized = False

    def on_one_minute_update(self, ts_ms: int, vol: int) -> int:
        with self._lock:
            if ts_ms <= 0:
                return self.closed_sum + max(0, self.last_vol)
            safe_vol = max(0, vol)
            if not self.initialized:
                self.last_ts_ms = ts_ms
                self.last_vol = safe_vol
                self.initialized = True
                return self.closed_sum + self.last_vol
            if ts_ms + 60_000 < self.last_ts_ms:
                self.closed_sum = 0
                self.last_ts_ms = ts_ms
                self.last_vol = safe_vol
                return self.closed_sum + self.last_vol
            if ts_ms > self.last_ts_ms:
                self.closed_sum += self.last_vol
                self.last_ts_ms = ts_ms
                self.last_vol = safe_vol
            elif ts_ms == self.last_ts_ms:
                self.last_vol = safe_vol
            return self.closed_sum + self.last_vol


class IndexVolumeSupport:
    def __init__(self) -> None:
        self._trackers: dict[str, OneMinuteSessionTracker] = {}
        self._first_tick_logged: set[str] = set()

    def resolve(self, instrument_key: str, ohlc_bars: list[_OhlcBar] | list[dict] | None) -> ResolveResult:
        if ohlc_bars is None:
            return ResolveResult.empty("null_feed")
        bars = [_normalize_bar(b) for b in ohlc_bars]
        bars = [b for b in bars if b is not None]
        if not bars:
            return ResolveResult.empty("no_ohlc")

        day_vol = find_interval_volume(bars, "1d")
        i1 = find_one_minute_bar(bars)
        i1_vol = i1[1] if i1 else 0
        i1_ts = i1[0] if i1 else 0
        ohlc_count = len(bars)

        if day_vol > 0:
            return ResolveResult(day_vol, day_vol, i1_vol, i1_ts, ohlc_count, "1d")
        if i1 is None:
            return ResolveResult(0, day_vol, 0, 0, ohlc_count, "none")

        tracker = self._trackers.setdefault(instrument_key, OneMinuteSessionTracker())
        session = tracker.on_one_minute_update(i1_ts, i1_vol)
        return ResolveResult(session, day_vol, i1_vol, i1_ts, ohlc_count, "I1")

    def should_log_first_tick(self, instrument_key: str) -> bool:
        if not instrument_key or not instrument_key.strip():
            return False
        if instrument_key in self._first_tick_logged:
            return False
        self._first_tick_logged.add(instrument_key)
        return True

    def clear(self, instrument_key: str) -> None:
        self._trackers.pop(instrument_key, None)
        self._first_tick_logged.discard(instrument_key)

    def clear_all(self) -> None:
        self._trackers.clear()
        self._first_tick_logged.clear()


def normalize_ts_ms(ts: int) -> int:
    if ts > 0 and ts < 1_000_000_000_000:
        return ts * 1000
    return ts


def find_interval_volume(bars: list[_OhlcBar], interval: str) -> int:
    for bar in bars:
        if bar.interval and bar.interval.lower() == interval.lower():
            return max(0, bar.vol)
    return 0


def find_one_minute_bar(bars: list[_OhlcBar]) -> tuple[int, int] | None:
    for bar in bars:
        if not bar.interval:
            continue
        if bar.interval.lower() in ("i1", "1m"):
            return normalize_ts_ms(bar.ts), max(0, bar.vol)
    return None


def _normalize_bar(b) -> _OhlcBar | None:
    if b is None:
        return None
    if isinstance(b, _OhlcBar):
        return b
    if isinstance(b, dict):
        return _OhlcBar(
            interval=str(b.get("interval") or ""),
            vol=int(b.get("vol") or 0),
            ts=int(b.get("ts") or 0),
        )
    # protobuf-like object
    return _OhlcBar(
        interval=str(getattr(b, "interval", "") or ""),
        vol=int(getattr(b, "vol", 0) or 0),
        ts=int(getattr(b, "ts", 0) or 0),
    )

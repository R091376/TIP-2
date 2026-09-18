"""OHLCV warehouse: durable cache for replay. Not keyed to the watchlist."""

from __future__ import annotations

import logging
import queue
import threading
from datetime import datetime, timezone
from typing import Protocol

from app.events import CandleClosedEvent
from app.market.models import Candle

logger = logging.getLogger(__name__)

_ALLOWED_TF = frozenset({"1m", "5m", "15m", "1h", "4h", "1d"})


class CandleWarehouse(Protocol):
    def upsert_many(
        self,
        instrument_key: str,
        timeframe: str,
        candles: list[Candle],
        *,
        source: str = "historical",
    ) -> int: ...

    def load(
        self,
        instrument_key: str,
        timeframe: str,
        from_time: int,
        to_time: int,
    ) -> list[Candle]: ...

    def coverage(
        self, instrument_key: str, timeframe: str
    ) -> tuple[int, int] | None: ...

    def set_coverage(
        self, instrument_key: str, timeframe: str, from_time: int, to_time: int
    ) -> None: ...

    def on_candle_closed(self, event: CandleClosedEvent) -> None: ...


def _to_candle(row) -> Candle:
    return Candle(
        time=int(row.time),
        open=float(row.open),
        high=float(row.high),
        low=float(row.low),
        close=float(row.close),
        volume=int(row.volume or 0),
    )


class InMemoryCandleWarehouse:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._bars: dict[tuple[str, str, int], Candle] = {}
        self._cov: dict[tuple[str, str], tuple[int, int]] = {}

    def upsert_many(
        self,
        instrument_key: str,
        timeframe: str,
        candles: list[Candle],
        *,
        source: str = "historical",
    ) -> int:
        if not instrument_key or timeframe not in _ALLOWED_TF or not candles:
            return 0
        n = 0
        with self._lock:
            for c in candles:
                key = (instrument_key, timeframe, int(c.time))
                self._bars[key] = c
                n += 1
            times = [int(c.time) for c in candles]
            self._widen_coverage(instrument_key, timeframe, min(times), max(times))
        return n

    def load(
        self,
        instrument_key: str,
        timeframe: str,
        from_time: int,
        to_time: int,
    ) -> list[Candle]:
        with self._lock:
            out = [
                c
                for (k, tf, t), c in self._bars.items()
                if k == instrument_key and tf == timeframe and from_time <= t <= to_time
            ]
        out.sort(key=lambda c: c.time)
        return out

    def coverage(self, instrument_key: str, timeframe: str) -> tuple[int, int] | None:
        with self._lock:
            return self._cov.get((instrument_key, timeframe))

    def set_coverage(
        self, instrument_key: str, timeframe: str, from_time: int, to_time: int
    ) -> None:
        with self._lock:
            self._widen_coverage(instrument_key, timeframe, from_time, to_time)

    def _widen_coverage(
        self, instrument_key: str, timeframe: str, from_time: int, to_time: int
    ) -> None:
        key = (instrument_key, timeframe)
        prev = self._cov.get(key)
        if prev is None:
            self._cov[key] = (from_time, to_time)
            return
        self._cov[key] = (min(prev[0], from_time), max(prev[1], to_time))

    def on_candle_closed(self, event: CandleClosedEvent) -> None:
        if event.candle is None:
            return
        self.upsert_many(
            event.instrument_key, event.timeframe, [event.candle], source="live"
        )


class PostgresCandleWarehouse:
    """Upserts closed bars. Live closes are queued so the event bus is not blocked."""

    def __init__(self, session_factory) -> None:
        self._sf = session_factory
        self._q: queue.Queue[tuple[str, str, Candle]] = queue.Queue(maxsize=20_000)
        self._stop = threading.Event()
        self._thread = threading.Thread(
            target=self._drain, name="candle-warehouse", daemon=True
        )
        self._thread.start()

    def shutdown(self) -> None:
        self._stop.set()
        self._thread.join(timeout=2.0)

    def upsert_many(
        self,
        instrument_key: str,
        timeframe: str,
        candles: list[Candle],
        *,
        source: str = "historical",
    ) -> int:
        if not instrument_key or timeframe not in _ALLOWED_TF or not candles:
            return 0
        from app.market.warehouse_entities import MarketCandleRow

        now = datetime.now(timezone.utc)
        payload = [
            {
                "instrument_key": instrument_key,
                "timeframe": timeframe,
                "time": int(c.time),
                "open": float(c.open),
                "high": float(c.high),
                "low": float(c.low),
                "close": float(c.close),
                "volume": int(c.volume or 0),
                "source": source,
                "ingested_at": now,
            }
            for c in candles
        ]
        with self._sf() as s:
            bind = s.get_bind()
            if bind.dialect.name == "postgresql":
                from sqlalchemy.dialects.postgresql import insert
            else:
                from sqlalchemy.dialects.sqlite import insert

            chunk = 200
            for i in range(0, len(payload), chunk):
                part = payload[i : i + chunk]
                stmt = insert(MarketCandleRow).values(part)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["instrument_key", "timeframe", "time"],
                    set_={
                        "open": stmt.excluded.open,
                        "high": stmt.excluded.high,
                        "low": stmt.excluded.low,
                        "close": stmt.excluded.close,
                        "volume": stmt.excluded.volume,
                        "source": stmt.excluded.source,
                        "ingested_at": stmt.excluded.ingested_at,
                    },
                )
                s.execute(stmt)
            s.commit()
        times = [int(c.time) for c in candles]
        self.set_coverage(instrument_key, timeframe, min(times), max(times))
        return len(payload)

    def load(
        self,
        instrument_key: str,
        timeframe: str,
        from_time: int,
        to_time: int,
    ) -> list[Candle]:
        from sqlalchemy import select

        from app.market.warehouse_entities import MarketCandleRow

        with self._sf() as s:
            rows = s.scalars(
                select(MarketCandleRow)
                .where(
                    MarketCandleRow.instrument_key == instrument_key,
                    MarketCandleRow.timeframe == timeframe,
                    MarketCandleRow.time >= int(from_time),
                    MarketCandleRow.time <= int(to_time),
                )
                .order_by(MarketCandleRow.time)
            ).all()
            return [_to_candle(r) for r in rows]

    def coverage(self, instrument_key: str, timeframe: str) -> tuple[int, int] | None:
        from app.market.warehouse_entities import MarketCandleCoverageRow

        with self._sf() as s:
            row = s.get(
                MarketCandleCoverageRow,
                {"instrument_key": instrument_key, "timeframe": timeframe},
            )
            if row is None:
                return None
            return int(row.from_time), int(row.to_time)

    def set_coverage(
        self, instrument_key: str, timeframe: str, from_time: int, to_time: int
    ) -> None:
        from app.market.warehouse_entities import MarketCandleCoverageRow

        now = datetime.now(timezone.utc)
        with self._sf() as s:
            row = s.get(
                MarketCandleCoverageRow,
                {"instrument_key": instrument_key, "timeframe": timeframe},
            )
            if row is None:
                s.add(
                    MarketCandleCoverageRow(
                        instrument_key=instrument_key,
                        timeframe=timeframe,
                        from_time=int(from_time),
                        to_time=int(to_time),
                        updated_at=now,
                    )
                )
            else:
                row.from_time = min(int(row.from_time), int(from_time))
                row.to_time = max(int(row.to_time), int(to_time))
                row.updated_at = now
            s.commit()

    def on_candle_closed(self, event: CandleClosedEvent) -> None:
        if event.candle is None:
            return
        try:
            self._q.put_nowait((event.instrument_key, event.timeframe, event.candle))
        except queue.Full:
            logger.warning("Candle warehouse queue full; dropping %s %s", event.instrument_key, event.timeframe)

    def _drain(self) -> None:
        batch: list[tuple[str, str, Candle]] = []
        while not self._stop.is_set():
            try:
                item = self._q.get(timeout=0.4)
                batch.append(item)
                while len(batch) < 80:
                    try:
                        batch.append(self._q.get_nowait())
                    except queue.Empty:
                        break
                grouped: dict[tuple[str, str], list[Candle]] = {}
                for key, tf, c in batch:
                    grouped.setdefault((key, tf), []).append(c)
                for (key, tf), candles in grouped.items():
                    try:
                        self.upsert_many(key, tf, candles, source="live")
                    except Exception:
                        logger.exception("Warehouse live upsert failed %s %s", key, tf)
                batch.clear()
            except queue.Empty:
                continue
            except Exception:
                logger.exception("Warehouse drain failed")
                batch.clear()

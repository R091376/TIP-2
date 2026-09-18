"""Gap-fill historical OHLCV into the warehouse via Upstox History V3."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.config import Settings
from app.market.candle_boundary import NSE_SESSION_CLOSE_MINUTES, NSE_SESSION_OPEN_MINUTES
from app.market.models import Candle
from app.market.upstox_provider import UpstoxMarketDataException
from app.market.warehouse import CandleWarehouse

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

_CHUNK_DAYS = {
    "1m": 4,
    "5m": 20,
    "15m": 28,
    "1h": 90,
    "4h": 90,
    "1d": 365,
}
_TF_SECONDS = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "4h": 14400,
    "1d": 86400,
}


def historical_chunk_days(timeframe: str) -> int:
    return _CHUNK_DAYS.get(timeframe or "", 28)


def session_start_epoch(d: date) -> int:
    dt = datetime(d.year, d.month, d.day, 0, 0, tzinfo=IST)
    return int(dt.timestamp())


def session_end_epoch(d: date) -> int:
    dt = datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=IST)
    return int(dt.timestamp())


def _ist_minutes_epoch(d: date, minutes: int) -> int:
    hh, mm = divmod(int(minutes), 60)
    return int(datetime(d.year, d.month, d.day, hh, mm, tzinfo=IST).timestamp())


def _last_intraday_bar_start(d: date, close_minutes: int, bar_sec: int) -> int:
    open_ep = _ist_minutes_epoch(d, NSE_SESSION_OPEN_MINUTES)
    close_ep = _ist_minutes_epoch(d, close_minutes)
    if bar_sec <= 0:
        return close_ep
    span = close_ep - open_ep
    if span < bar_sec:
        return open_ep
    return open_ep + ((span - bar_sec) // bar_sec) * bar_sec


def coverage_complete(
    cov: tuple[int, int] | None,
    from_date: date,
    to_date: date,
    timeframe: str,
    close_minutes: int | None = None,
) -> bool:
    """True when warehouse coverage spans the requested session window.

    Start must reach session open on ``from_date`` (09:15 IST; midnight for 1d).
    End must reach the last in-session bar on ``to_date``. A missing day or a
    session that ends early refetches.
    """
    if cov is None:
        return False
    tf = (timeframe or "").strip().lower()
    if tf == "1d":
        return cov[0] <= session_start_epoch(from_date) and cov[1] >= session_start_epoch(
            to_date
        )
    open_ep = _ist_minutes_epoch(from_date, NSE_SESSION_OPEN_MINUTES)
    close_m = int(close_minutes) if close_minutes else NSE_SESSION_CLOSE_MINUTES
    bar_sec = int(_TF_SECONDS.get(tf, 300))
    last_ep = _last_intraday_bar_start(to_date, close_m, bar_sec)
    return cov[0] <= open_ep and cov[1] >= last_ep


class CandleIngestService:
    def __init__(
        self,
        settings: Settings,
        market_provider,
        warehouse: CandleWarehouse,
    ) -> None:
        self._settings = settings
        self._mdp = market_provider
        self._wh = warehouse

    def ensure_range(
        self,
        instrument_key: str,
        timeframe: str,
        from_date: date,
        to_date: date,
        *,
        close_minutes: int | None = None,
    ) -> list[Candle]:
        """Return bars in [from_date, to_date]. Fetch only missing ends/empty cache."""
        if from_date > to_date:
            from_date, to_date = to_date, from_date
        want_from = session_start_epoch(from_date)
        want_to = session_end_epoch(to_date)
        cov = self._wh.coverage(instrument_key, timeframe)
        need_fetch = not coverage_complete(
            cov, from_date, to_date, timeframe, close_minutes
        )
        if need_fetch:
            fetched = self._fetch_chunked(
                instrument_key, timeframe, from_date, to_date, close_minutes
            )
            if fetched:
                self._wh.upsert_many(
                    instrument_key, timeframe, fetched, source="backfill"
                )
            # Also pull today's forming session via intraday if to_date is today.
            today = datetime.now(tz=IST).date()
            if to_date >= today:
                try:
                    intra = self._mdp.fetch_intraday_candles(
                        instrument_key, timeframe, close_minutes=close_minutes
                    )
                except UpstoxMarketDataException:
                    logger.warning(
                        "Intraday ingest failed %s %s", instrument_key, timeframe
                    )
                    intra = []
                if intra:
                    self._wh.upsert_many(
                        instrument_key, timeframe, intra, source="backfill"
                    )
        return self._wh.load(instrument_key, timeframe, want_from, want_to)

    def _fetch_chunked(
        self,
        instrument_key: str,
        timeframe: str,
        from_date: date,
        to_date: date,
        close_minutes: int | None,
    ) -> list[Candle]:
        chunk_days = historical_chunk_days(timeframe)
        all_c: list[Candle] = []
        chunk_end = to_date
        while chunk_end >= from_date:
            chunk_start = chunk_end - timedelta(days=chunk_days - 1)
            if chunk_start < from_date:
                chunk_start = from_date
            try:
                chunk = self._mdp.fetch_historical_candles(
                    instrument_key,
                    timeframe,
                    chunk_start,
                    chunk_end,
                    close_minutes=close_minutes,
                )
                all_c.extend(chunk or [])
            except UpstoxMarketDataException as e:
                logger.warning(
                    "Historical ingest chunk failed %s %s %s→%s: %s",
                    timeframe,
                    instrument_key,
                    chunk_start,
                    chunk_end,
                    e,
                )
            chunk_end = chunk_start - timedelta(days=1)
        by_time: dict[int, Candle] = {}
        for c in all_c:
            by_time[int(c.time)] = c
        return [by_time[t] for t in sorted(by_time)]

from __future__ import annotations

import logging
from datetime import date
from typing import Protocol
from urllib.parse import quote

import httpx

from app.config import Settings
from app.market.models import Candle
from app.market.timeframe import parse_timeframe
from app.market.upstox_candle_mapper import from_raw_candles

logger = logging.getLogger(__name__)

BASE = "https://api.upstox.com/v3"


class UpstoxMarketDataException(Exception):
    pass


class TickHandler(Protocol):
    def on_tick(self, tick) -> None: ...


class MarketDataProvider(Protocol):
    def fetch_intraday_candles(self, instrument_key: str, timeframe: str) -> list[Candle]: ...

    def fetch_historical_candles(
        self, instrument_key: str, timeframe: str, from_date: date, to_date: date
    ) -> list[Candle]: ...

    def connect_live_feed(self, instrument_keys: set[str], handler: TickHandler) -> None: ...

    def subscribe_instruments(self, instrument_keys: set[str]) -> None: ...

    def unsubscribe_instruments(self, instrument_keys: set[str]) -> None: ...

    def disconnect_live_feed(self) -> None: ...


class UpstoxMarketDataProvider:
    """REST candles via Upstox History V3; live feed delegated to UpstoxFeedClient."""

    def __init__(self, settings: Settings, feed_client=None) -> None:
        self._settings = settings
        self._feed = feed_client
        self._client = httpx.Client(timeout=60.0)

    def _headers(self) -> dict[str, str]:
        token = self._settings.upstox_access_token
        return {
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        }

    def fetch_intraday_candles(self, instrument_key: str, timeframe: str) -> list[Candle]:
        spec = parse_timeframe(timeframe)
        # GET /v3/historical-candle/intraday/{instrument_key}/{unit}/{interval}
        key_enc = quote(instrument_key, safe="")
        url = f"{BASE}/historical-candle/intraday/{key_enc}/{spec.unit}/{spec.interval}"
        try:
            resp = self._client.get(url, headers=self._headers())
            resp.raise_for_status()
            data = resp.json().get("data") or {}
            return from_raw_candles(data.get("candles"))
        except Exception as e:
            raise UpstoxMarketDataException(
                f"Failed to fetch intraday candles for {instrument_key}: {e}"
            ) from e

    def fetch_historical_candles(
        self,
        instrument_key: str,
        timeframe: str,
        from_date: date,
        to_date: date,
    ) -> list[Candle]:
        spec = parse_timeframe(timeframe)
        key_enc = quote(instrument_key, safe="")
        # GET /v3/historical-candle/{instrument_key}/{unit}/{interval}/{to_date}/{from_date}
        url = (
            f"{BASE}/historical-candle/{key_enc}/{spec.unit}/{spec.interval}/"
            f"{to_date.isoformat()}/{from_date.isoformat()}"
        )
        try:
            resp = self._client.get(url, headers=self._headers())
            if resp.status_code >= 400:
                body = (resp.text or "")[:300]
                raise UpstoxMarketDataException(
                    f"Failed to fetch historical candles for {instrument_key}: "
                    f"{resp.status_code} {body}"
                )
            data = resp.json().get("data") or {}
            return from_raw_candles(data.get("candles"))
        except UpstoxMarketDataException:
            raise
        except Exception as e:
            raise UpstoxMarketDataException(
                f"Failed to fetch historical candles for {instrument_key}: {e}"
            ) from e

    def connect_live_feed(self, instrument_keys: set[str], handler: TickHandler) -> None:
        if self._feed is None:
            logger.warning("Live feed client not configured")
            return
        logger.info("Starting Upstox live feed for %s instrument(s)", len(instrument_keys))
        self._feed.connect(instrument_keys, handler)

    def subscribe_instruments(self, instrument_keys: set[str]) -> None:
        if self._feed is None:
            return
        logger.info("Subscribing live feed instruments: %s", instrument_keys)
        self._feed.subscribe(instrument_keys)

    def unsubscribe_instruments(self, instrument_keys: set[str]) -> None:
        if self._feed is None:
            return
        logger.info("Unsubscribing live feed instruments: %s", instrument_keys)
        self._feed.unsubscribe(instrument_keys)

    def disconnect_live_feed(self) -> None:
        if self._feed is None:
            return
        self._feed.disconnect()

    def close(self) -> None:
        self._client.close()

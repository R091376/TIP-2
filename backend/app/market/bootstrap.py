from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta

from app.config import Settings
from app.market.candle_engine import CandleEngine
from app.market.market_status import MarketStatusService
from app.market.models import Candle, Tick
from app.market.nse_clock import BootstrapStatus
from app.market.seed_merger import merge_candles
from app.market.upstox_provider import UpstoxMarketDataException
from app.watchlist.models import SymbolBootstrapStatus, WatchlistEntry
from app.watchlist.repository import WatchlistRepository

logger = logging.getLogger(__name__)


def _historical_chunk_days(timeframe: str) -> int:
    """Upstox History V3 max range per request (Java MarketProperties parity)."""
    return {
        "1m": 4,
        "5m": 20,
        "15m": 28,
        "1h": 90,
        "4h": 90,
        "1d": 365,
    }.get(timeframe or "", 28)


@dataclass(frozen=True, slots=True)
class BootstrapSymbolResult:
    symbol_id: str
    status: SymbolBootstrapStatus
    seeded_tf_count: int = 0
    seeded_candle_count: int = 0

    @staticmethod
    def ready(symbol_id: str, tf_count: int, candles: int) -> BootstrapSymbolResult:
        return BootstrapSymbolResult(symbol_id, SymbolBootstrapStatus.READY, tf_count, candles)

    @staticmethod
    def failed(symbol_id: str) -> BootstrapSymbolResult:
        return BootstrapSymbolResult(symbol_id, SymbolBootstrapStatus.FAILED)

    @staticmethod
    def cancelled(symbol_id: str) -> BootstrapSymbolResult:
        return BootstrapSymbolResult(symbol_id, SymbolBootstrapStatus.REMOVING)


class MarketBootstrapService:
    def __init__(
        self,
        market_data_provider,
        candle_engine: CandleEngine,
        settings: Settings,
        market_status: MarketStatusService,
        watchlist_repository: WatchlistRepository,
        on_tick_extra=None,
        instruments=None,
    ) -> None:
        self._mdp = market_data_provider
        self._engine = candle_engine
        self._settings = settings
        self._status = market_status
        self._watchlist = watchlist_repository
        self._on_tick_extra = on_tick_extra
        self._instruments = instruments
        self._close_by_key: dict[str, int] = {}
        self._daily_sr = None
        self._warehouse = None

    def set_daily_sr_service(self, svc) -> None:
        self._daily_sr = svc

    def set_warehouse(self, warehouse) -> None:
        self._warehouse = warehouse

    def _cas_enabled(self) -> bool:
        return bool(getattr(self._settings, "cas_session_enabled", True))

    def _remember_close(self, entry: WatchlistEntry) -> int:
        from app.market.session_policy import cts_close_minutes, session_kind

        kind = session_kind(
            entry.trading_symbol,
            segment=entry.segment,
            instrument_type=entry.instrument_type,
        )
        close = cts_close_minutes(kind, cas_enabled=self._cas_enabled())
        self._close_by_key[entry.symbol_id] = close
        return close

    def forget_close(self, instrument_key: str) -> None:
        self._close_by_key.pop(instrument_key, None)

    def _close_for_tick(self, instrument_key: str) -> int:
        cached = self._close_by_key.get(instrument_key)
        if cached is not None:
            return cached
        from app.market.session_policy import cts_close_minutes, session_kind_from_cache

        kind = session_kind_from_cache(instrument_key, self._instruments)
        close = cts_close_minutes(kind, cas_enabled=self._cas_enabled())
        self._close_by_key[instrument_key] = close
        return close


    def recover_all_active(self) -> None:
        self._status.set_bootstrap_pending()
        self._status.refresh_phase_from_clock()

        if not self._settings.upstox_access_token.strip():
            self._status.set_bootstrap_failed(
                "UPSTOX_ACCESS_TOKEN is not configured. Add it to your .env file."
            )
            logger.warning("Session recovery skipped — UPSTOX_ACCESS_TOKEN is not set")
            return

        active = self._watchlist.find_all_active()
        if not active:
            self._status.set_bootstrap_failed(
                "No symbols on watchlist to bootstrap. Check seed configuration and instrument master."
            )
            logger.warning("Session recovery skipped — watchlist is empty")
            return

        ready_count = 0
        total_candles = 0
        n = len(active)
        for i, entry in enumerate(active, start=1):
            logger.info(
                "Session recovery: symbol %s/%s %s (%s)",
                i,
                n,
                entry.trading_symbol,
                entry.symbol_id,
            )
            result = self.bootstrap_symbol(entry)
            if result.status == SymbolBootstrapStatus.READY:
                ready_count += 1
                total_candles += result.seeded_candle_count

        if ready_count >= 1:
            self._status.set_bootstrap_ready(total_candles)
            logger.info(
                "Session recovery complete: %s/%s symbols READY, total seeded candles≈%s",
                ready_count,
                n,
                total_candles,
            )
            self.ensure_live_feed_connected()
        else:
            self._status.set_bootstrap_failed(
                "Failed to seed any watchlist symbol. Check Upstox token and network."
            )
            logger.error("Session recovery failed: zero symbols READY of %s", n)

    def ensure_live_feed_connected(self) -> None:
        if not self._settings.live_feed_enabled:
            return
        logger.info("ensureLiveFeedConnected: ensuring Upstox streamer for active watchlist")
        self._connect_live_feed_for_active()

    def bootstrap_symbol(self, entry: WatchlistEntry) -> BootstrapSymbolResult:
        symbol_id = entry.symbol_id
        close = self._remember_close(entry)
        timeframes = list(self._settings.supported_timeframes)
        if getattr(self._settings, "pattern_sr_enabled", False):
            rest = [tf for tf in timeframes if tf not in ("1d", "1m")]
            timeframes = [tf for tf in ("1d", "1m") if tf in self._settings.supported_timeframes] + rest
        seeded_tf = 0
        candle_count = 0
        errors: list[str] = []

        if not self._is_cancelled(symbol_id):
            self._update_bootstrap_status(symbol_id, SymbolBootstrapStatus.PENDING, None)

        for timeframe in timeframes:
            if self._is_cancelled(symbol_id):
                logger.info("Bootstrap cancelled for %s before TF %s", symbol_id, timeframe)
                return BootstrapSymbolResult.cancelled(symbol_id)
            try:
                seed_candles = self._load_seed_candles(
                    symbol_id, timeframe, close_minutes=close
                )
                self._engine.seed(
                    symbol_id, timeframe, seed_candles, close_minutes=close
                )
                if seed_candles and self._warehouse is not None:
                    try:
                        self._warehouse.upsert_many(
                            symbol_id, timeframe, seed_candles, source="historical"
                        )
                    except Exception:
                        logger.exception(
                            "Warehouse seed upsert failed %s %s", symbol_id, timeframe
                        )
                if not seed_candles:
                    errors.append(f"{timeframe}: empty seed (no candles)")
                    logger.warning(
                        "Empty seed for %s %s — not counted as successful TF",
                        symbol_id,
                        timeframe,
                    )
                    continue
                seeded_tf += 1
                candle_count += len(seed_candles)
                logger.info(
                    "Seeded %s %s candles for %s (count=%s)",
                    timeframe,
                    entry.trading_symbol,
                    symbol_id,
                    len(seed_candles),
                )
            except UpstoxMarketDataException as e:
                msg = str(e)
                errors.append(f"{timeframe}: {msg}")
                logger.error("Seed failed for %s %s: %s", symbol_id, timeframe, msg)
            except Exception as e:
                msg = str(e) or repr(e)
                errors.append(f"{timeframe}: {msg}")
                logger.error("Seed failed for %s %s: %s", symbol_id, timeframe, msg)

        if self._is_cancelled(symbol_id):
            return BootstrapSymbolResult.cancelled(symbol_id)

        if seeded_tf >= 1:
            self._update_bootstrap_status(symbol_id, SymbolBootstrapStatus.READY, None)
            logger.info(
                "Symbol READY: %s (%s TF(s) seeded, candles≈%s)",
                entry.trading_symbol,
                seeded_tf,
                candle_count,
            )
            if self._daily_sr is not None:
                try:
                    self._daily_sr.ensure_today(symbol_id)
                except Exception:
                    logger.exception("Daily SR ensure_today failed for %s", symbol_id)
            return BootstrapSymbolResult.ready(symbol_id, seeded_tf, candle_count)

        err = "; ".join(errors) if errors else "No timeframes seeded"
        self._update_bootstrap_status(symbol_id, SymbolBootstrapStatus.FAILED, err)
        logger.error("Symbol FAILED: %s — %s", entry.trading_symbol, err)
        return BootstrapSymbolResult.failed(symbol_id)

    def on_tick(self, tick: Tick) -> None:
        # Gate live bars on wall-clock NSE session, not feed market_info alone.
        # Global clock stays 15:30 so non-CAS names keep trading; per-symbol
        # CTS drops CAS/index ticks after 15:15. Never hit the watchlist repo.
        from datetime import datetime

        from app.market.candle_boundary import NSE_ZONE
        from app.market.nse_clock import MarketPhase, phase_at, phase_from_clock

        if phase_from_clock() != MarketPhase.OPEN:
            return
        close = self._close_for_tick(tick.instrument_key)
        if phase_at(datetime.now(tz=NSE_ZONE), close_minutes=close) != MarketPhase.OPEN:
            return
        if self._on_tick_extra is not None:
            try:
                self._on_tick_extra(tick)  # must be non-blocking
            except Exception:
                logger.exception("on_tick_extra failed")
        for tf in self._settings.supported_timeframes:
            try:
                self._engine.process_tick(tick, tf, close_minutes=close)
            except Exception:
                logger.exception("process_tick failed for %s %s", tick.instrument_key, tf)

    def _load_seed_candles(
        self,
        instrument_key: str,
        timeframe: str,
        close_minutes: int | None = None,
    ) -> list[Candle]:
        # Historical window: [today-lookback … yesterday]; today via intraday
        from app.market.candle_boundary import NSE_ZONE
        from datetime import datetime

        today = datetime.now(tz=NSE_ZONE).date()
        to_date = today - timedelta(days=1)
        lookback = max(1, self._settings.lookback_days_for(timeframe))
        from_date = to_date - timedelta(days=lookback - 1)
        if from_date > to_date:
            from_date = to_date

        try:
            intraday = self._mdp.fetch_intraday_candles(
                instrument_key, timeframe, close_minutes=close_minutes
            )
        except UpstoxMarketDataException:
            logger.warning(
                "Intraday fetch failed for %s %s; using historical only",
                instrument_key,
                timeframe,
            )
            intraday = []

        historical = self._fetch_historical_chunked(
            instrument_key,
            timeframe,
            from_date,
            to_date,
            close_minutes=close_minutes,
        )
        return merge_candles(historical, intraday)

    def _fetch_historical_chunked(
        self,
        instrument_key: str,
        timeframe: str,
        from_date: date,
        to_date: date,
        close_minutes: int | None = None,
    ) -> list[Candle]:
        """Walk date range in Upstox-safe chunks (mirrors Java MarketBootstrapService)."""
        chunk_days = _historical_chunk_days(timeframe)
        all_c: list[Candle] = []
        chunk_end = to_date
        chunks = 0
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
            except UpstoxMarketDataException as e:
                logger.warning(
                    "Historical chunk failed %s %s %s→%s: %s",
                    timeframe,
                    instrument_key,
                    chunk_start,
                    chunk_end,
                    e,
                )
                chunk = []
            all_c.extend(chunk)
            chunks += 1
            if chunk_start == from_date:
                break
            chunk_end = chunk_start - timedelta(days=1)
        if chunks > 1:
            logger.debug(
                "Historical %s for %s: %s chunk(s), %s raw candles",
                timeframe,
                instrument_key,
                chunks,
                len(all_c),
            )
        return all_c

    def _connect_live_feed_for_active(self) -> None:
        keys = {e.symbol_id for e in self._watchlist.find_all_active()}
        if not keys:
            return
        try:
            self._mdp.connect_live_feed(keys, self.on_tick)
        except Exception:
            logger.exception("Failed to connect live feed")

    def _is_cancelled(self, symbol_id: str) -> bool:
        entry = self._watchlist.find_by_symbol_id(symbol_id)
        if entry is None:
            return True
        return entry.bootstrap_status == SymbolBootstrapStatus.REMOVING

    def _update_bootstrap_status(
        self, symbol_id: str, status: SymbolBootstrapStatus, error: str | None
    ) -> None:
        entry = self._watchlist.find_by_symbol_id(symbol_id)
        if entry is None:
            return
        self._watchlist.save(entry.with_bootstrap(status, error))

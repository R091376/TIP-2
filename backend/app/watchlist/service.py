from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone

from fastapi import HTTPException

from app.config import Settings
from app.events import EventBus, WatchlistSymbolRemovedEvent
from app.instrument.cache import InstrumentMasterCache, InstrumentNotFoundException
from app.watchlist.models import SymbolBootstrapStatus, WatchlistEntry
from app.watchlist.repository import WatchlistRepository

logger = logging.getLogger(__name__)
MAX_SYMBOL_LENGTH = 64


class WatchlistService:
    def __init__(
        self,
        repo: WatchlistRepository,
        settings: Settings,
        instruments: InstrumentMasterCache,
        bootstrap_service=None,
        market_data_provider=None,
        candle_engine=None,
        live_broadcaster=None,
        live_ws_handler=None,
        event_bus: EventBus | None = None,
    ) -> None:
        self._repo = repo
        self._settings = settings
        self._instruments = instruments
        self._bootstrap = bootstrap_service
        self._mdp = market_data_provider
        self._engine = candle_engine
        self._broadcaster = live_broadcaster
        self._ws = live_ws_handler
        self._events = event_bus
        self._add_capacity_lock = threading.RLock()
        self._locks: dict[str, threading.RLock] = {}
        self._locks_guard = threading.RLock()

    def wire(
        self,
        bootstrap_service=None,
        market_data_provider=None,
        candle_engine=None,
        live_broadcaster=None,
        live_ws_handler=None,
    ) -> None:
        if bootstrap_service is not None:
            self._bootstrap = bootstrap_service
        if market_data_provider is not None:
            self._mdp = market_data_provider
        if candle_engine is not None:
            self._engine = candle_engine
        if live_broadcaster is not None:
            self._broadcaster = live_broadcaster
        if live_ws_handler is not None:
            self._ws = live_ws_handler

    def ensure_seeded(self) -> None:
        if self._repo.count_active() > 0:
            logger.debug(
                "Watchlist already has %s active symbol(s); skip seed",
                self._repo.count_active(),
            )
            return
        seeds = self._settings.seed_symbols
        if not seeds:
            logger.warning("tip.watchlist.seed-symbols is empty; watchlist remains empty")
            return
        logger.info("Seeding watchlist with %s configured symbol(s)", len(seeds))
        inserted = 0
        for trading_symbol in seeds:
            try:
                if self._insert_seed(trading_symbol):
                    inserted += 1
            except Exception as e:
                logger.error("Failed to seed watchlist symbol '%s': %s", trading_symbol, e)
        logger.info("Watchlist seed complete: inserted=%s/%s", inserted, len(seeds))

    def list_active(self) -> list[WatchlistEntry]:
        return self._repo.find_all_active()

    def add(self, trading_symbol: str | None, instrument_key: str | None = None) -> WatchlistEntry:
        resolved = self._resolve_for_add(trading_symbol, instrument_key)
        symbol_id = resolved.instrument_key
        symbol_lock = self._lock_for(symbol_id)
        saved = self._reserve_and_insert_pending(resolved, symbol_id, symbol_lock)

        result = None
        try:
            if self._bootstrap:
                result = self._bootstrap.bootstrap_symbol(saved)
        except Exception as e:
            logger.error("Unexpected bootstrap failure for %s: %s", symbol_id, e)
            self._mark_failed_if_present(symbol_id, symbol_lock, f"Bootstrap failed unexpectedly: {e}")

        with symbol_lock:
            after = self._repo.find_by_symbol_id(symbol_id)
            if (
                after is None
                or after.bootstrap_status == SymbolBootstrapStatus.REMOVING
                or (result is not None and result.status == SymbolBootstrapStatus.REMOVING)
            ):
                raise HTTPException(status_code=404, detail=f"Symbol was removed during bootstrap: {symbol_id}")

            entry = after
            status = entry.bootstrap_status
            if status in (SymbolBootstrapStatus.READY, SymbolBootstrapStatus.FAILED):
                try:
                    if self._bootstrap:
                        self._bootstrap.ensure_live_feed_connected()
                except Exception as e:
                    logger.warning("Failed to ensure live feed after add for %s: %s", symbol_id, e)
            elif status == SymbolBootstrapStatus.PENDING:
                self._mark_failed_unlocked(entry, "Bootstrap completed without status update")
                entry = self._repo.find_by_symbol_id(symbol_id) or entry

            logger.info("Watchlist add complete: %s status=%s", symbol_id, entry.bootstrap_status)
            return entry

    def remove(self, symbol_id: str) -> None:
        if not symbol_id or not symbol_id.strip():
            raise HTTPException(status_code=404, detail="Symbol not on watchlist")
        lock = self._lock_for(symbol_id)
        with lock:
            opt = self._repo.find_by_symbol_id(symbol_id)
            if opt is None:
                raise HTTPException(status_code=404, detail=f"Symbol not on watchlist: {symbol_id}")
            entry = opt
            if entry.bootstrap_status == SymbolBootstrapStatus.REMOVING:
                self._finish_remove(symbol_id)
                return
            removing = WatchlistEntry(
                symbol_id=entry.symbol_id,
                trading_symbol=entry.trading_symbol,
                exchange=entry.exchange,
                segment=entry.segment,
                instrument_type=entry.instrument_type,
                display_name=entry.display_name,
                added_at=entry.added_at,
                active=True,
                bootstrap_status=SymbolBootstrapStatus.REMOVING,
                bootstrap_error=entry.bootstrap_error,
            )
            self._repo.save(removing)
            logger.info("Watchlist remove REMOVING: %s", symbol_id)
            self._finish_remove(symbol_id)

    def _finish_remove(self, symbol_id: str) -> None:
        if self._mdp:
            try:
                self._mdp.unsubscribe_instruments({symbol_id})
            except Exception as e:
                logger.warning("unsubscribe failed for %s: %s", symbol_id, e)
        if self._engine:
            self._engine.evict(symbol_id)
        if self._broadcaster:
            self._broadcaster.evict_throttle_keys(symbol_id)
        if self._ws:
            self._ws.notify_symbol_removed(symbol_id)
        self._repo.remove(symbol_id)
        if self._events:
            self._events.publish(WatchlistSymbolRemovedEvent(symbol_id))
        logger.info("Watchlist remove complete: %s", symbol_id)

    def _reserve_and_insert_pending(self, resolved, symbol_id: str, symbol_lock: threading.RLock):
        with self._add_capacity_lock:
            with symbol_lock:
                if self._repo.contains_symbol_id(symbol_id):
                    raise HTTPException(
                        status_code=409,
                        detail=f"Symbol already on watchlist: {resolved.trading_symbol}",
                    )
                by_ts = self._repo.find_by_trading_symbol_ignore_case(resolved.trading_symbol)
                if by_ts is not None:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Symbol already on watchlist: {by_ts.trading_symbol}",
                    )
                if self._repo.find_by_symbol_id(symbol_id) is not None:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Symbol already on watchlist: {resolved.trading_symbol}",
                    )
                active = self._repo.count_active()
                hard_max = self._settings.hard_max_size
                if active >= hard_max:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Watchlist is full (max {hard_max} symbols)",
                    )
                if active >= self._settings.soft_warn_size:
                    logger.warning(
                        "Watchlist soft-warn threshold reached: active=%s softWarn=%s hardMax=%s",
                        active,
                        self._settings.soft_warn_size,
                        hard_max,
                    )
                pending = WatchlistEntry(
                    symbol_id=symbol_id,
                    trading_symbol=resolved.trading_symbol,
                    exchange=resolved.exchange or "NSE",
                    segment=resolved.segment,
                    instrument_type=resolved.instrument_type,
                    display_name=resolved.display_name or resolved.trading_symbol,
                    added_at=datetime.now(timezone.utc),
                    active=True,
                    bootstrap_status=SymbolBootstrapStatus.PENDING,
                    bootstrap_error=None,
                )
                saved = self._repo.save(pending)
                logger.info("Watchlist add PENDING: %s (%s)", resolved.trading_symbol, symbol_id)
                return saved

    def _lock_for(self, symbol_id: str) -> threading.RLock:
        with self._locks_guard:
            if symbol_id not in self._locks:
                self._locks[symbol_id] = threading.RLock()
            return self._locks[symbol_id]

    def _resolve_for_add(self, trading_symbol: str | None, instrument_key: str | None):
        has_key = instrument_key is not None and instrument_key.strip() != ""
        has_symbol = trading_symbol is not None and trading_symbol.strip() != ""
        if not has_key and not has_symbol:
            raise HTTPException(status_code=400, detail="symbol or instrumentKey is required")
        if has_key:
            key = self._validate_instrument_key(instrument_key)
            found = self._instruments.find_by_instrument_key(key)
            if found is None:
                raise HTTPException(status_code=404, detail=f"Unknown instrument key: {key}")
            return found
        input_sym = self._validate_trading_symbol(trading_symbol)
        try:
            return self._instruments.resolve(input_sym)
        except InstrumentNotFoundException:
            raise HTTPException(status_code=404, detail=f"Unknown trading symbol: {input_sym}")

    def _validate_instrument_key(self, instrument_key: str) -> str:
        trimmed = instrument_key.strip()
        if len(trimmed) > 128:
            raise HTTPException(status_code=400, detail="instrumentKey exceeds max length of 128")
        if any(ord(c) < 32 for c in trimmed):
            raise HTTPException(status_code=400, detail="instrumentKey contains invalid characters")
        return trimmed

    def _validate_trading_symbol(self, trading_symbol: str) -> str:
        if trading_symbol is None or not trading_symbol.strip():
            raise HTTPException(status_code=400, detail="symbol is required")
        trimmed = trading_symbol.strip()
        if len(trimmed) > MAX_SYMBOL_LENGTH:
            raise HTTPException(
                status_code=400, detail=f"symbol exceeds max length of {MAX_SYMBOL_LENGTH}"
            )
        if any(ord(c) < 32 for c in trimmed):
            raise HTTPException(status_code=400, detail="symbol contains invalid characters")
        return trimmed

    def _insert_seed(self, trading_symbol: str) -> bool:
        if not trading_symbol or not trading_symbol.strip():
            logger.error("Skipping blank seed symbol")
            return False
        pinned = self._lookup_seed_key(trading_symbol)
        if pinned:
            enrich = self._try_resolve(trading_symbol)
            entry = self._build_from_pinned(pinned, trading_symbol, enrich)
            self._repo.save(entry)
            logger.info("Seeded watchlist entry (pinned key): %s → %s", trading_symbol, pinned)
            return True
        try:
            resolved = self._instruments.resolve(trading_symbol)
            entry = WatchlistEntry(
                symbol_id=resolved.instrument_key,
                trading_symbol=resolved.trading_symbol,
                exchange=resolved.exchange or "NSE",
                segment=resolved.segment,
                instrument_type=resolved.instrument_type,
                display_name=resolved.display_name or resolved.trading_symbol,
                added_at=datetime.now(timezone.utc),
                active=True,
                bootstrap_status=SymbolBootstrapStatus.PENDING,
                bootstrap_error=None,
            )
            self._repo.save(entry)
            logger.info(
                "Seeded watchlist entry (master): %s → %s",
                trading_symbol,
                resolved.instrument_key,
            )
            return True
        except InstrumentNotFoundException:
            logger.error(
                "Skipping seed symbol unresolved (no pin, master miss): %s", trading_symbol
            )
            return False

    def _lookup_seed_key(self, trading_symbol: str) -> str | None:
        keys = self._settings.seed_instrument_keys or {}
        if trading_symbol in keys:
            return keys[trading_symbol]
        for k, v in keys.items():
            if k and k.lower() == trading_symbol.strip().lower():
                return v
        return None

    def _try_resolve(self, trading_symbol: str):
        try:
            return self._instruments.resolve(trading_symbol)
        except Exception:
            return None

    def _build_from_pinned(self, instrument_key: str, trading_symbol: str, enrich):
        if enrich is not None:
            return WatchlistEntry(
                symbol_id=instrument_key,
                trading_symbol=enrich.trading_symbol or trading_symbol,
                exchange=enrich.exchange or "NSE",
                segment=enrich.segment or _segment_from_key(instrument_key),
                instrument_type=enrich.instrument_type or _type_from_key(instrument_key),
                display_name=enrich.display_name or trading_symbol,
                added_at=datetime.now(timezone.utc),
                active=True,
                bootstrap_status=SymbolBootstrapStatus.PENDING,
                bootstrap_error=None,
            )
        return WatchlistEntry(
            symbol_id=instrument_key,
            trading_symbol=trading_symbol,
            exchange="NSE",
            segment=_segment_from_key(instrument_key),
            instrument_type=_type_from_key(instrument_key),
            display_name=trading_symbol,
            added_at=datetime.now(timezone.utc),
            active=True,
            bootstrap_status=SymbolBootstrapStatus.PENDING,
            bootstrap_error=None,
        )

    def _mark_failed_if_present(self, symbol_id: str, lock: threading.RLock, error: str) -> None:
        with lock:
            opt = self._repo.find_by_symbol_id(symbol_id)
            if opt is None or opt.bootstrap_status == SymbolBootstrapStatus.REMOVING:
                return
            self._mark_failed_unlocked(opt, error)

    def _mark_failed_unlocked(self, e: WatchlistEntry, error: str) -> None:
        self._repo.save(
            WatchlistEntry(
                symbol_id=e.symbol_id,
                trading_symbol=e.trading_symbol,
                exchange=e.exchange,
                segment=e.segment,
                instrument_type=e.instrument_type,
                display_name=e.display_name,
                added_at=e.added_at,
                active=e.active,
                bootstrap_status=SymbolBootstrapStatus.FAILED,
                bootstrap_error=error,
            )
        )
        logger.warning("Watchlist entry marked FAILED: %s — %s", e.symbol_id, error)


def _segment_from_key(instrument_key: str) -> str:
    if instrument_key and instrument_key.startswith("NSE_INDEX"):
        return "NSE_INDEX"
    return "NSE_EQ"


def _type_from_key(instrument_key: str) -> str:
    if instrument_key and instrument_key.startswith("NSE_INDEX"):
        return "INDEX"
    return "EQ"

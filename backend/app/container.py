from __future__ import annotations

import asyncio
import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from app.api.websocket.live import (
    LiveCandleBroadcaster,
    LiveWebSocketHub,
    MarketStatusBroadcaster,
)
from app.config import Settings
from app.events import (
    CandleClosedEvent,
    CandleUpdatedEvent,
    EventBus,
    MarketPhaseChangedEvent,
    PatternStageEvent,
    WatchlistSymbolRemovedEvent,
)
from app.instrument.cache import InstrumentMasterCache
from app.market.bootstrap import MarketBootstrapService
from app.market.candle_engine import CandleEngine
from app.market.market_status import MarketStatusService
from app.market.upstox_feed import UpstoxFeedClient
from app.market.upstox_provider import UpstoxMarketDataProvider
from app.patterns.active_store import ActiveInstanceStore
from app.patterns.evaluator import PatternEvaluator
from app.patterns.journal import InMemoryPatternJournal
from app.patterns.session_expiry import SessionExpiryReconciler
from app.patterns.startup import reconcile_patterns_on_startup
from app.user.service import UserService
from app.watchlist.repository import InMemoryWatchlistRepository, WatchlistRepository
from app.watchlist.service import WatchlistService

logger = logging.getLogger(__name__)


@dataclass
class AppContainer:
    settings: Settings
    event_bus: EventBus
    candle_engine: CandleEngine
    market_status: MarketStatusService
    instruments: InstrumentMasterCache
    watchlist_repo: WatchlistRepository
    watchlist_service: WatchlistService
    user_service: UserService
    market_provider: UpstoxMarketDataProvider
    feed_client: UpstoxFeedClient
    bootstrap: MarketBootstrapService
    pattern_service: PatternEvaluator
    active_store: ActiveInstanceStore
    pattern_journal: object  # InMemoryPatternJournal | PostgresPatternJournal
    session_expiry: SessionExpiryReconciler
    ws_hub: LiveWebSocketHub
    broadcaster: LiveCandleBroadcaster
    market_status_broadcaster: MarketStatusBroadcaster
    # SQLAlchemy sessionmaker when Postgres init succeeded; None = memory fallback
    session_factory: object | None = None
    postgres_init_error: str | None = None
    paper_service: object | None = None
    daily_sr_service: object | None = None
    _bg_stop: threading.Event | None = None
    _bg_thread: threading.Thread | None = None

    def wire_events(self) -> None:
        self.event_bus.subscribe(CandleUpdatedEvent, self.broadcaster.on_candle_updated)
        if self.daily_sr_service is not None:
            self.event_bus.subscribe(
                CandleUpdatedEvent, self.daily_sr_service.on_candle_updated
            )
        self.event_bus.subscribe(CandleClosedEvent, self.broadcaster.on_candle_closed)
        self.event_bus.subscribe(CandleClosedEvent, self.pattern_service.on_candle_closed)
        self.event_bus.subscribe(PatternStageEvent, self.broadcaster.on_pattern_stage)
        # Finalize open intraday bars *before* session pattern expiry so the
        # last RTH bar publishes CandleClosed and evaluators see it first.
        self.event_bus.subscribe(
            MarketPhaseChangedEvent, self._on_market_phase_for_candles
        )
        self.event_bus.subscribe(MarketPhaseChangedEvent, self.session_expiry.on_phase_changed)
        self.event_bus.subscribe(
            MarketPhaseChangedEvent, self.market_status_broadcaster.on_market_phase_changed
        )

        def on_removed(ev: WatchlistSymbolRemovedEvent) -> None:
            self.pattern_service.cancel_for_symbol(ev.symbol_id)

        self.event_bus.subscribe(WatchlistSymbolRemovedEvent, on_removed)

    def _on_market_phase_for_candles(self, event: MarketPhaseChangedEvent) -> None:
        if event.phase != "CLOSED":
            return
        n = self.candle_engine.finalize_session_candles()
        if n:
            logger.info("Session finalize: closed %s open intraday candle(s)", n)

    def startup(self, loop: asyncio.AbstractEventLoop) -> None:
        self.broadcaster.set_loop(loop)
        self.ws_hub.set_loop(loop)
        self.feed_client.set_event_loop(loop)

        logger.info(
            "TIP-2 starting (watchlist_store=%s memory_profile=%s)",
            self.settings.watchlist_store,
            self.settings.is_memory_profile,
        )

        self.instruments.ensure_loaded()
        self.watchlist_service.ensure_seeded()

        try:
            reconcile_patterns_on_startup(
                self.settings,
                self.pattern_journal,
                self.active_store,
                self.watchlist_repo,
                self.event_bus,
            )
        except Exception:
            logger.exception("Pattern startup reconcile failed")

        def _boot() -> None:
            try:
                self.bootstrap.recover_all_active()
            except Exception:
                logger.exception("Bootstrap recovery failed")
                return
            sr = getattr(self, "daily_sr_service", None)
            if sr is not None:
                try:
                    sr.ensure_all_active()
                    for entry in self.watchlist_repo.find_all_active():
                        sr.ensure_today(entry.symbol_id)
                except Exception:
                    logger.exception("Daily SR ensure_all_active failed")
            if getattr(self.settings, "pattern_sr_backfill_on_startup", False):
                try:
                    from app.sr.backfill import run_backfill

                    run_backfill(self)
                    reload = getattr(self.pattern_journal, "reload_research_cache", None)
                    if callable(reload):
                        reload()
                except Exception:
                    logger.exception("Woodie SR backfill failed")

        threading.Thread(target=_boot, name="bootstrap", daemon=True).start()

        self._bg_stop = threading.Event()

        def _reconcile() -> None:
            last_phase = None
            while self._bg_stop and not self._bg_stop.is_set():
                try:
                    # Phase flip to CLOSED runs finalize via event bus first,
                    # then SessionExpiryReconciler (subscription order).
                    self.market_status.refresh_phase_from_clock()
                    now_ms = int(time.time() * 1000)
                    self.candle_engine.close_stale_open_candles(now_ms)
                    phase = self.market_status.get_market_phase()
                    # Startup / already CLOSED: no phase-change event, but last
                    # RTH bars may still be open after seed or a quiet close.
                    if phase.value == "CLOSED":
                        n_fin = self.candle_engine.finalize_session_candles()
                        if n_fin:
                            logger.info(
                                "Session finalize: closed %s open intraday candle(s)",
                                n_fin,
                            )
                    # session close expiry when phase flips to CLOSED
                    if last_phase is not None and last_phase != phase and phase.value == "CLOSED":
                        n = self.pattern_service.expire_session_timeframes()
                        if n:
                            logger.info("Session expiry: expired %s pattern instance(s)", n)
                    last_phase = phase
                except Exception:
                    logger.exception("Reconciler error")
                self._bg_stop.wait(self.settings.phase_refresh_ms / 1000.0)

        self._bg_thread = threading.Thread(target=_reconcile, name="reconciler", daemon=True)
        self._bg_thread.start()

        # Research snapshot stays cold until the first research request
        # (PostgresPatternJournal.closed_event_snapshot → cache.ensure).

        if self.paper_service is not None:
            try:
                self.paper_service.start()
            except Exception:
                logger.exception("Paper trading service start failed")

    def shutdown(self) -> None:
        if self._bg_stop:
            self._bg_stop.set()
        if self.paper_service is not None:
            try:
                self.paper_service.stop()
            except Exception:
                pass
        try:
            self.feed_client.disconnect()
        except Exception:
            pass
        try:
            self.market_provider.close()
        except Exception:
            pass


def build_container(settings: Settings | None = None) -> AppContainer:
    settings = settings or Settings()
    event_bus = EventBus()
    market_status = MarketStatusService(event_bus)
    candle_engine = CandleEngine(event_bus)
    instruments = InstrumentMasterCache(settings)
    ws_hub = LiveWebSocketHub()
    broadcaster = LiveCandleBroadcaster(
        ws_hub, throttle_ms=settings.candle_update_throttle_ms
    )
    market_status_broadcaster = MarketStatusBroadcaster(ws_hub)

    session_factory = None
    postgres_init_error: str | None = None
    if settings.watchlist_store == "memory" or settings.is_memory_profile:
        watchlist_repo: WatchlistRepository = InMemoryWatchlistRepository()
        pattern_journal: object = InMemoryPatternJournal()
        logger.info("Using in-memory watchlist + pattern journal")
    else:
        try:
            from app.db.session import apply_flyway_sql, create_engine_and_session
            from app.journal.postgres_journal import PostgresPatternJournal
            from app.watchlist.postgres_repo import PostgresWatchlistRepository

            db_url = settings.sqlalchemy_url
            logger.info(
                "Connecting Postgres (%s)",
                db_url.split("@")[-1] if "@" in db_url else "(no host)",
            )
            engine, session_factory = create_engine_and_session(db_url)
            # Fail fast if credentials/network are wrong (don't wait for first request)
            from sqlalchemy import text as sa_text

            with engine.connect() as conn:
                conn.execute(sa_text("SELECT 1"))
            mig_dir = Path(__file__).resolve().parent.parent / "db" / "migration"
            apply_flyway_sql(engine, mig_dir)
            watchlist_repo = PostgresWatchlistRepository(session_factory)
            pattern_journal = PostgresPatternJournal(
                session_factory,
                research_cache_enabled=bool(
                    getattr(settings, "research_stats_cache_enabled", True)
                ),
                research_cache_ttl_seconds=int(
                    getattr(settings, "research_stats_cache_ttl_seconds", 86_400)
                ),
                research_max_range_days=int(
                    getattr(settings, "research_stats_max_range_days", 180)
                ),
                research_cache_load_timeout_ms=int(
                    getattr(settings, "research_stats_cache_load_timeout_ms", 30_000)
                ),
            )
            logger.info(
                "Using Postgres watchlist + journal + users (%s)",
                db_url.split("@")[-1] if "@" in db_url else db_url,
            )
        except Exception as e:
            postgres_init_error = str(e)[:300]
            logger.exception(
                "Postgres init failed; falling back to in-memory watchlist + journal"
            )
            watchlist_repo = InMemoryWatchlistRepository()
            pattern_journal = InMemoryPatternJournal()
            session_factory = None

    user_service = UserService(settings, session_factory=session_factory)
    feed_client = UpstoxFeedClient(settings, market_status)
    market_provider = UpstoxMarketDataProvider(settings, feed_client)

    paper_service = None
    if settings.paper_enabled:

        def _cash_provider(uid):
            u = user_service.find_by_id(uid)
            return u.cash_balance if u else 0

        def _cash_writer(uid, balance, ledger_tail):
            from decimal import Decimal

            from app.user.service import money

            u = user_service.find_by_id(uid)
            if u is None:
                return
            # Sync paper cash back to app_users when balance diverged
            target = money(balance)
            if money(u.cash_balance) == target:
                return
            # Use postgres path via seed/adjust: write through user service internals
            if user_service.is_postgres:
                from datetime import datetime, timezone
                from uuid import uuid4

                from app.user.entities import AppUserRow, CashLedgerRow

                with session_factory() as s:  # type: ignore[misc]
                    row = s.get(AppUserRow, uid)
                    if row is None:
                        return
                    prev = money(row.cash_balance)
                    row.cash_balance = target
                    row.updated_at = datetime.now(timezone.utc)
                    for le in ledger_tail or []:
                        s.add(
                            CashLedgerRow(
                                id=uuid4(),
                                user_id=uid,
                                entry_type=getattr(le, "entry_type", "ADJUST")[:32],
                                amount=money(getattr(le, "amount", 0)),
                                balance_after=money(getattr(le, "balance_after", target)),
                                note=(getattr(le, "note", None) or "paper")[:512],
                                created_at=datetime.now(timezone.utc),
                            )
                        )
                    s.commit()
            else:
                u.cash_balance = target

        from app.paper.service import PaperTradingService

        paper_service = PaperTradingService(
            settings,
            watchlist_repo,
            session_factory=session_factory,
            user_cash_provider=_cash_provider,
            user_cash_writer=_cash_writer,
        )

    def _paper_enqueue(tick):
        if paper_service is not None:
            paper_service.enqueue_tick(tick)

    bootstrap = MarketBootstrapService(
        market_provider,
        candle_engine,
        settings,
        market_status,
        watchlist_repo,
        on_tick_extra=_paper_enqueue if paper_service is not None else None,
    )

    from app.sr.service import DailySrService
    from app.sr.store import InMemoryDailySrStore, PostgresDailySrStore

    if session_factory is not None:
        daily_sr_store = PostgresDailySrStore(session_factory)
    else:
        daily_sr_store = InMemoryDailySrStore()
    daily_sr_service = DailySrService(settings, candle_engine, daily_sr_store)
    bootstrap.set_daily_sr_service(daily_sr_service)

    active_store = ActiveInstanceStore()
    pattern_service = PatternEvaluator(
        settings,
        candle_engine,
        watchlist_repo,
        active_store,
        pattern_journal,
        event_bus,
        daily_sr_service=daily_sr_service,
    )
    session_expiry = SessionExpiryReconciler(
        settings, active_store, pattern_journal, candle_engine, event_bus
    )

    watchlist_service = WatchlistService(
        watchlist_repo,
        settings,
        instruments,
        bootstrap_service=bootstrap,
        market_data_provider=market_provider,
        candle_engine=candle_engine,
        live_broadcaster=broadcaster,
        live_ws_handler=ws_hub,
        event_bus=event_bus,
    )

    container = AppContainer(
        settings=settings,
        event_bus=event_bus,
        candle_engine=candle_engine,
        market_status=market_status,
        instruments=instruments,
        watchlist_repo=watchlist_repo,
        watchlist_service=watchlist_service,
        user_service=user_service,
        market_provider=market_provider,
        feed_client=feed_client,
        bootstrap=bootstrap,
        pattern_service=pattern_service,
        active_store=active_store,
        pattern_journal=pattern_journal,
        session_expiry=session_expiry,
        ws_hub=ws_hub,
        broadcaster=broadcaster,
        market_status_broadcaster=market_status_broadcaster,
        session_factory=session_factory,
        postgres_init_error=postgres_init_error,
        paper_service=paper_service,
        daily_sr_service=daily_sr_service,
    )
    container.wire_events()
    return container

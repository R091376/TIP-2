from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.config import Settings
from app.events import CandleClosedEvent, EventBus, PatternStageEvent as BusPatternEvent
from app.patterns.active_store import ActiveInstanceStore
from app.patterns.breakout import evaluate_breakout_bar
from app.patterns.breakdown import evaluate_breakdown_bar
from app.patterns.consolidation import evaluate_consolidation_bar
from app.patterns.engulfing import evaluate_engulfing_bar
from app.patterns.inside_bar import evaluate_inside_bar
from app.patterns.journal import PatternJournal
from app.patterns.lifecycle_support import expire
from app.patterns.models import ActivePattern, PatternStage, PatternType
from app.patterns.pinbar import evaluate_pinbar_bar
from app.patterns.structure import evaluate_structure_bar
from app.patterns.volume_breakout import evaluate_volume_breakout_bar

logger = logging.getLogger(__name__)


class PatternEvaluator:
    def __init__(
        self,
        settings: Settings,
        candle_engine,
        watchlist_repo,
        active_store: ActiveInstanceStore,
        journal: PatternJournal,
        event_bus: EventBus | None = None,
    ) -> None:
        self._settings = settings
        self._engine = candle_engine
        self._watchlist = watchlist_repo
        self._store = active_store
        self._journal = journal
        self._events = event_bus

    def on_candle_closed(self, event: CandleClosedEvent) -> None:
        if not self._settings.pattern_enabled:
            return
        if not self._settings.pattern_tf_enabled(event.timeframe):
            return
        try:
            self._evaluate(event.instrument_key, event.timeframe)
        except Exception:
            logger.exception(
                "Pattern eval failed for %s %s", event.instrument_key, event.timeframe
            )

    def cancel_for_symbol(self, symbol_id: str) -> None:
        removed = self._store.remove_symbol(symbol_id)
        now = datetime.now(timezone.utc)
        for p in removed:
            if p.is_terminal():
                continue
            events = expire(p, None, "watchlist_remove", now, True)
            self._journal.persist_lifecycle(p, events)
            self._publish(p, events)

    def expire_session_timeframes(self) -> int:
        """Expire open instances on session-close TFs (1m/5m/15m)."""
        tfs = set(self._settings.expiry_session_close_timeframes)
        now = datetime.now(timezone.utc)
        count = 0
        for p in list(self._store.all_open()):
            if p.timeframe not in tfs:
                continue
            events = expire(p, None, "session_close", now, False)
            series = self._store.get_open(p.symbol_id, p.timeframe)
            still = [x for x in series if x.id != p.id and not x.is_terminal()]
            self._store.replace_series(p.symbol_id, p.timeframe, still)
            self._journal.persist_lifecycle(p, events)
            self._publish(p, events)
            count += 1
        return count

    def list_for_symbol(
        self, symbol_id: str, status: str | None = "active", timeframe: str | None = None
    ) -> list[dict]:
        f = (status or "active").lower()
        if f == "active":
            # Prefer live store; fall back to durable journal (e.g. after restart before hydrate)
            patterns = self._store.get_open_for_symbol(symbol_id)
            if not patterns and self._journal.is_active():
                patterns = self._journal.find_open_for_symbol(symbol_id)
            if timeframe:
                patterns = [p for p in patterns if p.timeframe == timeframe]
        else:
            patterns = self._journal.find_recent(symbol_id, f, 100)
            if timeframe:
                patterns = [p for p in patterns if p.timeframe == timeframe]
        return [p.to_dto() for p in patterns]

    def statistics_for_symbol(
        self, symbol_id: str, pattern_type: str | None, timeframe: str | None
    ) -> dict:
        if not timeframe:
            return {"status": "error", "message": "timeframe is required"}
        ptype = (pattern_type or "breakout").lower()
        snap = self._journal.find_statistics(symbol_id, ptype, timeframe)
        min_n = self._settings.stats_min_sample_size
        sample = snap.sample_size if snap else 0
        if snap is None or sample < min_n:
            return {
                "status": "insufficient_history",
                "sampleSize": sample,
                "minSampleSize": min_n,
            }
        body = snap.to_dict()
        body["status"] = "ok"
        body["minSampleSize"] = min_n
        return body

    def bulk_statistics(
        self, pattern_type: str | None, timeframe: str | None
    ) -> dict:
        """
        Shape matches Java PatternStatisticsController + FE patternStatisticsApi.ts:
        { minSampleSize, count, items: [...] }
        """
        active = self._watchlist.find_all_active()
        symbols = [e.symbol_id for e in active]
        by_id = {e.symbol_id: e for e in active}

        type_filter = (pattern_type or "").strip().lower() or None
        tf_filter = (timeframe or "").strip() or None
        snaps = self._journal.find_statistics_for_symbols(symbols, type_filter, tf_filter)
        min_n = self._settings.stats_min_sample_size

        items: list[dict] = []
        for s in snaps:
            entry = by_id.get(s.symbol_id)
            ready = s.sample_size >= min_n
            item = {
                "status": "ok" if ready else "insufficient_history",
                "symbolId": s.symbol_id,
                "tradingSymbol": entry.trading_symbol if entry else None,
                "displayName": entry.display_name if entry else None,
                "patternType": s.pattern_type,
                "timeframe": s.timeframe,
                "sampleSize": s.sample_size,
                "successCount": s.success_count,
                "failCount": s.fail_count,
                "expiredCount": s.expired_count,
                "minSampleSize": min_n,
                "resolvedSampleSize": s.resolved_sample_size,
                "moveSampleSize": s.move_sample_size,
                "mfeSampleSize": s.mfe_sample_size,
                "maeSampleSize": s.mae_sample_size,
                "updatedAt": s.updated_at.isoformat().replace("+00:00", "Z")
                if s.updated_at
                else None,
            }
            if ready:
                item["successRate"] = s.success_rate
                item["resolvedSuccessRate"] = s.resolved_success_rate
                item["avgMoveR"] = s.avg_move_r
                item["avgDurationCandles"] = s.avg_duration_candles
                item["avgMfeR"] = s.avg_mfe_r
                item["avgMaeR"] = s.avg_mae_r
            else:
                item["successRate"] = None
                item["resolvedSuccessRate"] = None
                item["avgMoveR"] = None
                item["avgDurationCandles"] = None
                item["avgMfeR"] = None
                item["avgMaeR"] = None
            items.append(item)

        # Sort: ready first by successRate desc, then by sampleSize
        def sort_key(r: dict):
            rate = r.get("successRate")
            return (
                0 if r.get("status") == "ok" else 1,
                -(rate if rate is not None else -1.0),
                -int(r.get("sampleSize") or 0),
            )

        items.sort(key=sort_key)
        return {
            "minSampleSize": min_n,
            "count": len(items),
            "items": items,
        }

    def _evaluate(self, symbol_id: str, timeframe: str) -> None:
        closed = self._engine.get_closed_candles(symbol_id, timeframe)
        if not closed:
            return
        now = datetime.now(timezone.utc)
        index = self._is_index(symbol_id)
        open_all = self._store.get_open(symbol_id, timeframe)

        cfg = self._settings
        bo_cfg = {**cfg.breakout, "atr_period": cfg.atr_period}
        bd_cfg = {**cfg.breakdown, "atr_period": cfg.atr_period}
        pin_cfg = {**cfg.pinbar, "atr_period": cfg.atr_period}
        eng_cfg = {**cfg.engulfing, "atr_period": cfg.atr_period}
        ib_cfg = {**cfg.inside_bar, "atr_period": cfg.atr_period}
        st_cfg = {**cfg.structure, "atr_period": cfg.atr_period}
        co_cfg = {**cfg.consolidation, "atr_period": cfg.atr_period}
        vb_cfg = {**cfg.volume_breakout, "atr_period": cfg.atr_period}

        def filt(pred):
            return [p for p in open_all if pred(p)]

        evals = [
            evaluate_breakout_bar(
                symbol_id,
                timeframe,
                filt(lambda p: p.pattern_type == PatternType.BREAKOUT),
                closed,
                index,
                bo_cfg,
                now,
            ),
            evaluate_breakdown_bar(
                symbol_id,
                timeframe,
                filt(lambda p: p.pattern_type == PatternType.BREAKDOWN),
                closed,
                index,
                bd_cfg,
                now,
            ),
            evaluate_pinbar_bar(
                symbol_id,
                timeframe,
                filt(lambda p: p.pattern_type.is_pin_bar()),
                closed,
                pin_cfg,
                now,
            ),
            evaluate_engulfing_bar(
                symbol_id,
                timeframe,
                filt(lambda p: p.pattern_type.is_engulfing()),
                closed,
                eng_cfg,
                now,
            ),
            evaluate_inside_bar(
                symbol_id,
                timeframe,
                filt(lambda p: p.pattern_type == PatternType.INSIDE_BAR),
                closed,
                ib_cfg,
                now,
            ),
            evaluate_structure_bar(
                symbol_id,
                timeframe,
                filt(lambda p: p.pattern_type.is_structure()),
                closed,
                st_cfg,
                now,
            ),
            evaluate_consolidation_bar(
                symbol_id,
                timeframe,
                filt(lambda p: p.pattern_type == PatternType.CONSOLIDATION),
                closed,
                co_cfg,
                now,
            ),
            evaluate_volume_breakout_bar(
                symbol_id,
                timeframe,
                filt(lambda p: p.pattern_type == PatternType.VOLUME_BREAKOUT),
                closed,
                index,
                vb_cfg,
                now,
            ),
        ]

        still: list[ActivePattern] = []
        for ev in evals:
            self._persist_eval(ev.advanced, ev.newly_detected, ev.events)
            still.extend(ev.still_open)

        self._store.replace_series(symbol_id, timeframe, still)

    def _persist_eval(
        self,
        advanced: list[ActivePattern],
        newly: list[ActivePattern],
        events: list,
    ) -> None:
        by_id: dict = {}
        for p in advanced + newly:
            by_id[p.id] = p
        # group events by pattern
        from collections import defaultdict

        grouped: dict = defaultdict(list)
        for e in events:
            grouped[e.pattern_id].append(e)

        for pid, pevts in grouped.items():
            pattern = by_id.get(pid)
            if pattern is None:
                continue
            self._journal.persist_lifecycle(pattern, pevts)
            self._publish(pattern, pevts)

        # patterns advanced with no events still need status sync
        for p in advanced + newly:
            if p.id not in grouped:
                self._journal.apply_events(p, [])

    def _publish(self, pattern: ActivePattern, events: list) -> None:
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
                        "id": str(pattern.id),
                        "referenceLevel": pattern.reference_level,
                        "price": e.price,
                        "time": e.candle_time,
                        "direction": pattern.direction.value,
                    },
                )
            )

    def _is_index(self, symbol_id: str) -> bool:
        entry = self._watchlist.find_by_symbol_id(symbol_id)
        if entry and entry.segment and "INDEX" in entry.segment.upper():
            return True
        return bool(symbol_id and symbol_id.startswith("NSE_INDEX"))


# alias used by container
PatternService = PatternEvaluator

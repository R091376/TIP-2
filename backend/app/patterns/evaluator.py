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
        """Expire open pattern instances on session-close TFs (default 1m/5m/15m).

        Called when market phase flips to CLOSED (after
        ``CandleEngine.finalize_session_candles`` force-closes open intraday
        bars so the last RTH ``CandleClosed`` has already been evaluated).
        Patterns that never hit succeed/fail get terminal stage=expired.
        """
        tfs = set(self._settings.expiry_session_close_timeframes or [])
        now = datetime.now(timezone.utc)
        count = 0
        for p in list(self._store.all_open()):
            if p.timeframe not in tfs:
                continue
            if p.is_terminal():
                continue
            last = self._last_closed_candle(p.symbol_id, p.timeframe)
            events = expire(p, last, "session_close", now, False)
            if not events:
                continue
            series = self._store.get_open(p.symbol_id, p.timeframe)
            still = [x for x in series if x.id != p.id and not x.is_terminal()]
            self._store.replace_series(p.symbol_id, p.timeframe, still)
            self._journal.persist_lifecycle(p, events)
            self._publish(p, events)
            count += 1
        return count

    def _last_closed_candle(self, symbol_id: str, timeframe: str):
        try:
            closed = self._engine.get_closed_candles(symbol_id, timeframe)
            return closed[-1] if closed else None
        except Exception:
            return None

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
        elif f == "closed":
            patterns = self._journal.find_recent(symbol_id, "closed", 100)
            if timeframe:
                patterns = [p for p in patterns if p.timeframe == timeframe]
        else:
            # status=all: always merge live store opens ∪ journal opens ∪ recent
            by_id: dict[str, object] = {}
            for p in self._store.get_open_for_symbol(symbol_id) or []:
                by_id[str(getattr(p, "id", ""))] = p
            if self._journal.is_active():
                for p in self._journal.find_open_for_symbol(symbol_id) or []:
                    pid = str(getattr(p, "id", ""))
                    # Live store wins when both present (fresher MFE/MAE/status)
                    if pid and pid not in by_id:
                        by_id[pid] = p
                for p in self._journal.find_recent(symbol_id, "all", 100) or []:
                    pid = str(getattr(p, "id", ""))
                    if pid and pid not in by_id:
                        by_id[pid] = p
            patterns = [p for p in by_id.values() if p is not None]
            if timeframe:
                patterns = [p for p in patterns if p.timeframe == timeframe]
        return [p.to_dto() for p in patterns]

    def get_instance(self, symbol_id: str, instance_id: str) -> dict | None:
        """Resolve one instance by id (live store first, then journal)."""
        if not symbol_id or not instance_id:
            return None
        want = str(instance_id)
        for p in self._store.get_open_for_symbol(symbol_id) or []:
            if str(getattr(p, "id", "")) == want:
                return p.to_dto()
        find = getattr(self._journal, "find_by_id", None)
        if callable(find):
            p = find(instance_id)
            if p is not None and getattr(p, "symbol_id", None) == symbol_id:
                return p.to_dto()
        # Fallback scan (memory journal without find_by_id)
        for filt in ("active", "closed", "all"):
            for item in self.list_for_symbol(symbol_id, status=filt, timeframe=None):
                if str(item.get("id", "")) == want:
                    return item
        return None

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
        # Null planned-rails averages when no valid trade offers in the sample
        if snap.planned_rr_sample_size <= 0:
            body["avgPlannedRr"] = None
            body["avgRiskR"] = None
            body["avgRewardR"] = None
            body["minPlannedRr"] = None
            body["maxPlannedRr"] = None
            body["medianPlannedRr"] = None
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
        # Stats are scoped to the current watchlist (product decision). Empty
        # watchlist → empty items (avoid IN () queries on the journal).
        if not symbols:
            return {
                "minSampleSize": self._settings.stats_min_sample_size,
                "count": 0,
                "items": [],
            }
        snaps = self._journal.find_statistics_for_symbols(symbols, type_filter, tf_filter)
        min_n = self._settings.stats_min_sample_size

        items = [
            _snapshot_to_bulk_item(s, by_id.get(s.symbol_id), min_n) for s in snaps
        ]
        items.sort(key=_bulk_stats_sort_key)
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
        atr = self._settings.atr_period

        # (open-filter, settings attr, evaluate_fn, needs_index_flag)
        specs: list[tuple] = [
            (
                lambda p: p.pattern_type == PatternType.BREAKOUT,
                "breakout",
                evaluate_breakout_bar,
                True,
            ),
            (
                lambda p: p.pattern_type == PatternType.BREAKDOWN,
                "breakdown",
                evaluate_breakdown_bar,
                True,
            ),
            (lambda p: p.pattern_type.is_pin_bar(), "pinbar", evaluate_pinbar_bar, False),
            (
                lambda p: p.pattern_type.is_engulfing(),
                "engulfing",
                evaluate_engulfing_bar,
                False,
            ),
            (
                lambda p: p.pattern_type == PatternType.INSIDE_BAR,
                "inside_bar",
                evaluate_inside_bar,
                False,
            ),
            (
                lambda p: p.pattern_type.is_structure(),
                "structure",
                evaluate_structure_bar,
                False,
            ),
            (
                lambda p: p.pattern_type == PatternType.CONSOLIDATION,
                "consolidation",
                evaluate_consolidation_bar,
                False,
            ),
            (
                lambda p: p.pattern_type == PatternType.VOLUME_BREAKOUT,
                "volume_breakout",
                evaluate_volume_breakout_bar,
                True,
            ),
        ]

        still: list[ActivePattern] = []
        for pred, cfg_attr, evaluate_fn, needs_index in specs:
            cfg = {**getattr(self._settings, cfg_attr), "atr_period": atr}
            open_items = [p for p in open_all if pred(p)]
            if needs_index:
                ev = evaluate_fn(
                    symbol_id, timeframe, open_items, closed, index, cfg, now
                )
            else:
                ev = evaluate_fn(symbol_id, timeframe, open_items, closed, cfg, now)
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
                        # Stable event id (matches journal day-alerts shape)
                        "id": f"{pattern.id}:{e.stage.value}:{e.candle_time}:{e.price}",
                        "instanceId": str(pattern.id),
                        "referenceLevel": pattern.reference_level,
                        "price": e.price,
                        "time": e.candle_time,
                        "direction": pattern.direction.value,
                        # Rails frozen at detect — available for DET and every later stage
                        "entryPrice": pattern.entry_price,
                        "stopLevel": pattern.stop_level,
                        "targetLevel": pattern.target_level,
                        "atrAtDetect": pattern.atr_at_detect,
                        "status": pattern.status.value,
                    },
                )
            )

    def _is_index(self, symbol_id: str) -> bool:
        entry = self._watchlist.find_by_symbol_id(symbol_id)
        if entry and entry.segment and "INDEX" in entry.segment.upper():
            return True
        return bool(symbol_id and symbol_id.startswith("NSE_INDEX"))


def _snapshot_to_bulk_item(s, entry, min_n: int) -> dict:
    """Map a journal statistics snapshot to the bulk stats API item shape."""
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
        "successRate": s.success_rate if ready else None,
        "resolvedSuccessRate": s.resolved_success_rate if ready else None,
        "avgMoveR": s.avg_move_r if ready else None,
        "avgDurationCandles": s.avg_duration_candles if ready else None,
        "avgMfeR": s.avg_mfe_r if ready else None,
        "avgMaeR": s.avg_mae_r if ready else None,
        "avgPlannedRr": (
            s.avg_planned_rr
            if ready and s.planned_rr_sample_size > 0
            else None
        ),
        "avgRiskR": (
            s.avg_risk_r if ready and s.planned_rr_sample_size > 0 else None
        ),
        "avgRewardR": (
            s.avg_reward_r if ready and s.planned_rr_sample_size > 0 else None
        ),
        "minPlannedRr": (
            s.min_planned_rr if ready and s.planned_rr_sample_size > 0 else None
        ),
        "maxPlannedRr": (
            s.max_planned_rr if ready and s.planned_rr_sample_size > 0 else None
        ),
        "medianPlannedRr": (
            s.median_planned_rr if ready and s.planned_rr_sample_size > 0 else None
        ),
        "plannedRrSampleSize": s.planned_rr_sample_size,
    }
    return item


def _bulk_stats_sort_key(r: dict):
    """Ready rows first, then success rate desc, then sample size desc."""
    rate = r.get("successRate")
    return (
        0 if r.get("status") == "ok" else 1,
        -(rate if rate is not None else -1.0),
        -int(r.get("sampleSize") or 0),
    )


# alias used by container
PatternService = PatternEvaluator

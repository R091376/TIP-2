from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.config import Settings
from app.events import CandleClosedEvent, EventBus, PatternStageEvent as BusPatternEvent
from app.patterns.active_store import ActiveInstanceStore
from app.patterns.breakout import evaluate_breakout_bar
from app.patterns.breakdown import evaluate_breakdown_bar
from app.patterns.consolidation import evaluate_consolidation_bar
from app.patterns.double import evaluate_double_bar
from app.patterns.engulfing import evaluate_engulfing_bar
from app.patterns.expected_r import expected_r
from app.patterns.head_shoulders import evaluate_hs_bar
from app.patterns.inside_bar import evaluate_inside_bar
from app.patterns.journal import PatternJournal
from app.patterns.lifecycle_support import expire
from app.patterns.models import ActivePattern, PatternStage, PatternType
from app.patterns.pinbar import evaluate_pinbar_bar
from app.patterns.planned_rails import passes_min_risk_r, planned_rails_from_pattern
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
        daily_sr_service=None,
    ) -> None:
        self._settings = settings
        self._engine = candle_engine
        self._watchlist = watchlist_repo
        self._store = active_store
        self._journal = journal
        self._events = event_bus
        self._daily_sr = daily_sr_service

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

    def expire_session_timeframes(self, symbol_ids: set[str] | None = None) -> int:
        """Expire open pattern instances on session-close TFs (default 1m/5m/15m).

        Called when that symbol's CTS ends (after
        ``CandleEngine.finalize_session_candles`` force-closes open intraday
        bars so the last RTH ``CandleClosed`` has already been evaluated).
        Patterns that never hit succeed/fail get terminal stage=expired.
        """
        tfs = set(self._settings.expiry_session_close_timeframes or [])
        now = datetime.now(timezone.utc)
        count = 0
        for p in list(self._store.all_open()):
            if symbol_ids is not None and p.symbol_id not in symbol_ids:
                continue
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
        body["expectedR"] = expected_r(
            body.get("resolvedSuccessRate"),
            body.get("avgPlannedRr"),
        )
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

    def query_statistics(self, raw_params: dict) -> dict:
        """
        Research / composable-filter stats (query-time over instances ⨝ outcomes).

        Raises:
            ValueError: invalid filters (HTTP 400)
            PermissionError: not used (auth at API layer)
            RuntimeError: research disabled / wrong journal (HTTP 503)
            TimeoutError: statement timeout (HTTP 503)
        """
        from app.patterns.research_filters import (
            ResearchFilterError,
            has_sr_filters,
            parse_research_filters,
        )
        from app.patterns.research_metrics import empty_research_response

        if not self._settings.pattern_enabled:
            raise RuntimeError("Pattern feature disabled")
        if not getattr(self._settings, "pattern_research_stats_enabled", True):
            raise RuntimeError("Research stats disabled")
        if has_sr_filters(raw_params) and not getattr(
            self._settings, "pattern_sr_research_enabled", True
        ):
            raise ValueError("Woodie SR research disabled")

        supports = getattr(self._journal, "supports_research_aggregation", None)
        if not callable(supports) or not supports():
            raise RuntimeError("Pattern research requires Postgres journal")

        try:
            spec = parse_research_filters(
                raw_params,
                default_min_sample_size=self._settings.stats_min_sample_size,
                max_range_days=int(
                    getattr(self._settings, "research_stats_max_range_days", 180)
                ),
                default_lookback_days=int(
                    getattr(self._settings, "research_stats_default_lookback_days", 180)
                ),
            )
        except ResearchFilterError as exc:
            raise ValueError(str(exc)) from exc

        active = self._watchlist.find_all_active()
        by_id = {e.symbol_id: e for e in active}
        active_ids = [e.symbol_id for e in active]
        if not active_ids:
            return empty_research_response(spec)

        # Intersect explicit symbol filter with active watchlist
        if spec.symbol_ids is not None:
            wanted = set(spec.symbol_ids)
            allowed = [s for s in active_ids if s in wanted]
            if len(spec.symbol_ids) > 200:
                raise ValueError("symbolId list too long (max 200)")
            if not allowed:
                return empty_research_response(spec)
            if len(allowed) > 200:
                raise ValueError("symbolId list exceeds 200 after watchlist intersect")
        else:
            allowed = active_ids
            if len(allowed) > 200:
                allowed = allowed[:200]

        labels = {
            sid: (
                by_id[sid].trading_symbol if sid in by_id else None,
                by_id[sid].display_name if sid in by_id else None,
            )
            for sid in allowed
        }
        timeout_ms = int(
            getattr(self._settings, "research_stats_statement_timeout_ms", 5000)
        )
        return self._journal.aggregate_filtered(
            spec,
            allowed_symbol_ids=allowed,
            symbol_labels=labels,
            statement_timeout_ms=timeout_ms,
        )

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
            (
                lambda p: p.pattern_type.is_double(),
                "double",
                evaluate_double_bar,
                True,
            ),
            (
                lambda p: p.pattern_type.is_head_shoulders(),
                "head_shoulders",
                evaluate_hs_bar,
                True,
            ),
        ]

        still: list[ActivePattern] = []
        for pred, cfg_attr, evaluate_fn, needs_index in specs:
            cfg = {**getattr(self._settings, cfg_attr), "atr_period": atr}
            family_on = True
            if cfg_attr == "double":
                family_on = bool(getattr(self._settings, "pattern_double_enabled", True))
            elif cfg_attr == "head_shoulders":
                family_on = bool(getattr(self._settings, "pattern_hs_enabled", True))
            tf_map = cfg.get("enabled_timeframes")
            tf_on = True if not isinstance(tf_map, dict) else bool(tf_map.get(timeframe, True))
            cfg = {
                **cfg,
                "_new_detects": bool(cfg.get("enabled", True) and family_on and tf_on),
            }
            open_items = [p for p in open_all if pred(p)]
            if needs_index:
                ev = evaluate_fn(
                    symbol_id, timeframe, open_items, closed, index, cfg, now
                )
            else:
                ev = evaluate_fn(symbol_id, timeframe, open_items, closed, cfg, now)
            advanced, newly, events, still_open = self._gate_min_risk(
                ev.advanced, ev.newly_detected, ev.events, ev.still_open
            )
            if newly and self._sr_stamp_enabled():
                self._stamp_sr(symbol_id, timeframe, closed, newly)
            self._persist_eval(advanced, newly, events)
            still.extend(still_open)

        self._store.replace_series(symbol_id, timeframe, still)

    def _sr_stamp_enabled(self) -> bool:
        return bool(getattr(self._settings, "pattern_sr_enabled", True)) and bool(
            getattr(self._settings, "pattern_sr_stamp_enabled", True)
        )

    def _stamp_sr(
        self,
        symbol_id: str,
        timeframe: str,
        closed: list,
        newly: list[ActivePattern],
    ) -> None:
        if not newly or not closed or self._daily_sr is None:
            return
        from app.patterns.research_filters import as_epoch_seconds, detect_candle_ist
        from app.sr.stamp import stamp_woodie_sr

        signal = closed[-1]
        det_dt = detect_candle_ist(as_epoch_seconds(signal.time))
        if det_dt is None:
            return
        session_date = det_dt.date()
        levels = self._daily_sr.ensure_levels(symbol_id, session_date)
        if levels is None:
            logger.info(
                "Woodie SR stamp skipped missing_levels symbol=%s session_date=%s n=%s",
                symbol_id,
                session_date,
                len(newly),
            )
            return
        near = float(getattr(self._settings, "pattern_sr_near_atr", 0.5) or 0.5)
        for p in newly:
            stamp_woodie_sr(
                p, signal, levels, session_date=session_date, near_atr=near
            )

    def _gate_min_risk(
        self,
        advanced: list[ActivePattern],
        newly: list[ActivePattern],
        events: list,
        still_open: list[ActivePattern],
    ) -> tuple[list[ActivePattern], list[ActivePattern], list, list[ActivePattern]]:
        """Drop brand-new detections whose planned risk_r is below the configured floor.

        Suppresses journal rows and WS/day alerts for tiny-stop noise. Already-open
        instances (advanced) are not re-checked — only ids present in ``newly``.
        """
        min_r = float(getattr(self._settings, "pattern_min_risk_r", 0.3) or 0.0)
        if min_r <= 0 or not newly:
            return advanced, newly, events, still_open

        kept_newly: list[ActivePattern] = []
        rejected: set = set()
        for p in newly:
            if passes_min_risk_r(p, min_r):
                kept_newly.append(p)
                continue
            rejected.add(p.id)
            rails = planned_rails_from_pattern(p)
            risk_s = f"{rails.risk_r:.4f}" if rails else "n/a"
            logger.info(
                "Suppress detect (risk_r %s < min %.3f): id=%s type=%s %s %s",
                risk_s,
                min_r,
                p.id,
                getattr(p.pattern_type, "value", p.pattern_type),
                p.symbol_id,
                p.timeframe,
            )

        if not rejected:
            return advanced, newly, events, still_open

        advanced = [p for p in advanced if p.id not in rejected]
        events = [e for e in events if getattr(e, "pattern_id", None) not in rejected]
        still_open = [p for p in still_open if p.id not in rejected]
        return advanced, kept_newly, events, still_open

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
    item["expectedR"] = expected_r(
        item.get("resolvedSuccessRate"),
        item.get("avgPlannedRr"),
    )
    return item


def _bulk_stats_sort_key(r: dict):
    """Ready first, then Expected R desc, then sample size desc."""
    edge = r.get("expectedR")
    return (
        0 if r.get("status") == "ok" else 1,
        -(edge if edge is not None else -1.0e9),
        -int(r.get("sampleSize") or 0),
    )


# alias used by container
PatternService = PatternEvaluator

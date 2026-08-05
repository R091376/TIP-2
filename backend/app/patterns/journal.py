from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol
from uuid import UUID

from app.patterns.models import ActivePattern, FinalOutcome, PatternStage, PatternStageEvent
from app.patterns.planned_rails import median_planned_rr, planned_rails_from_pattern


@dataclass
class PatternStatisticsSnapshot:
    symbol_id: str
    pattern_type: str
    timeframe: str
    sample_size: int = 0
    success_count: int = 0
    fail_count: int = 0
    expired_count: int = 0
    success_rate: float = 0.0
    resolved_success_rate: float | None = None
    resolved_sample_size: int = 0
    avg_move_r: float = 0.0
    avg_duration_candles: float = 0.0
    avg_mfe_r: float = 0.0
    avg_mae_r: float = 0.0
    move_sample_size: int = 0
    mfe_sample_size: int = 0
    mae_sample_size: int = 0
    avg_planned_rr: float = 0.0
    avg_risk_r: float = 0.0
    avg_reward_r: float = 0.0
    planned_rr_sample_size: int = 0
    min_planned_rr: float = 0.0
    max_planned_rr: float = 0.0
    median_planned_rr: float = 0.0
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "symbolId": self.symbol_id,
            "patternType": self.pattern_type,
            "timeframe": self.timeframe,
            "sampleSize": self.sample_size,
            "successCount": self.success_count,
            "failCount": self.fail_count,
            "expiredCount": self.expired_count,
            "successRate": self.success_rate,
            "resolvedSuccessRate": self.resolved_success_rate,
            "resolvedSampleSize": self.resolved_sample_size,
            "avgMoveR": self.avg_move_r,
            "avgDurationCandles": self.avg_duration_candles,
            "avgMfeR": self.avg_mfe_r,
            "avgMaeR": self.avg_mae_r,
            "moveSampleSize": self.move_sample_size,
            "mfeSampleSize": self.mfe_sample_size,
            "maeSampleSize": self.mae_sample_size,
            "avgPlannedRr": self.avg_planned_rr,
            "avgRiskR": self.avg_risk_r,
            "avgRewardR": self.avg_reward_r,
            "plannedRrSampleSize": self.planned_rr_sample_size,
            "minPlannedRr": self.min_planned_rr,
            "maxPlannedRr": self.max_planned_rr,
            "medianPlannedRr": self.median_planned_rr,
            "updatedAt": self.updated_at.isoformat().replace("+00:00", "Z"),
        }


class PatternJournal(Protocol):
    def is_active(self) -> bool: ...
    def insert_detected(self, pattern: ActivePattern, detected_event: PatternStageEvent | None) -> None: ...
    def apply_events(self, pattern: ActivePattern, events: list[PatternStageEvent]) -> None: ...
    def persist_lifecycle(self, pattern: ActivePattern, all_events: list[PatternStageEvent]) -> None: ...
    def find_open(self, symbol_id: str, timeframe: str) -> list[ActivePattern]: ...
    def find_open_for_symbol(self, symbol_id: str) -> list[ActivePattern]: ...
    def find_recent(self, symbol_id: str, status_filter: str, limit: int) -> list[ActivePattern]: ...
    def find_statistics(
        self, symbol_id: str, pattern_type: str, timeframe: str
    ) -> PatternStatisticsSnapshot | None: ...
    def find_statistics_for_symbols(
        self, symbol_ids: list[str], pattern_type: str | None, timeframe: str | None
    ) -> list[PatternStatisticsSnapshot]: ...

    def list_session_day_alerts(
        self,
        *,
        day=None,
        limit: int = 500,
        symbol_id: str | None = None,
        timeframe: str | None = None,
        include_expired: bool = False,
    ) -> list[dict]: ...


class NoOpPatternJournal:
    def is_active(self) -> bool:
        return False

    def insert_detected(self, pattern, detected_event) -> None:
        pass

    def apply_events(self, pattern, events) -> None:
        pass

    def persist_lifecycle(self, pattern, all_events) -> None:
        pass

    def find_open(self, symbol_id, timeframe) -> list[ActivePattern]:
        return []

    def find_open_for_symbol(self, symbol_id) -> list[ActivePattern]:
        return []

    def find_open_by_timeframes(self, timeframes) -> list[ActivePattern]:
        return []

    def find_recent(self, symbol_id, status_filter, limit) -> list[ActivePattern]:
        return []

    def find_by_id(self, pattern_id):
        return None

    def find_statistics(self, symbol_id, pattern_type, timeframe):
        return None

    def find_statistics_for_symbols(self, symbol_ids, pattern_type, timeframe):
        return []

    def list_session_day_alerts(
        self, *, day=None, limit=500, symbol_id=None, timeframe=None, include_expired=False
    ):
        return []

    def purge_instance(self, pattern_id) -> bool:
        return False

    def purge_by_outcome_reason(self, reason: str) -> int:
        return 0


class InMemoryPatternJournal:
    """Full journal semantics in process memory (memory profile + tests)."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._instances: dict[UUID, ActivePattern] = {}
        self._events: dict[UUID, list[PatternStageEvent]] = {}
        self._stats: dict[tuple[str, str, str], PatternStatisticsSnapshot] = {}
        # rolling sums for averages
        self._stat_sums: dict[tuple[str, str, str], dict] = {}

    def is_active(self) -> bool:
        return True

    def insert_detected(
        self, pattern: ActivePattern, detected_event: PatternStageEvent | None
    ) -> None:
        with self._lock:
            self._instances[pattern.id] = pattern
            if detected_event:
                self._events.setdefault(pattern.id, []).append(detected_event)

    def apply_events(
        self, pattern: ActivePattern, events: list[PatternStageEvent]
    ) -> None:
        with self._lock:
            self._instances[pattern.id] = pattern
            if events:
                self._events.setdefault(pattern.id, []).extend(events)
            if pattern.is_terminal():
                self._upsert_stats(pattern)

    def purge_instance(self, pattern_id: UUID) -> bool:
        with self._lock:
            if pattern_id not in self._instances:
                return False
            del self._instances[pattern_id]
            self._events.pop(pattern_id, None)
            return True

    def purge_by_outcome_reason(self, reason: str) -> int:
        """In-memory: drop terminal patterns whose terminal_reason matches."""
        if not reason:
            return 0
        with self._lock:
            ids = [
                pid
                for pid, p in self._instances.items()
                if p.is_terminal() and (p.terminal_reason or "") == reason
            ]
            for pid in ids:
                del self._instances[pid]
                self._events.pop(pid, None)
            return len(ids)

    def persist_lifecycle(
        self, pattern: ActivePattern, all_events: list[PatternStageEvent]
    ) -> None:
        if not all_events:
            self.apply_events(pattern, [])
            return
        has_detected = any(e.stage == PatternStage.DETECTED for e in all_events)
        if has_detected:
            det = next(e for e in all_events if e.stage == PatternStage.DETECTED)
            self.insert_detected(pattern, det)
            rest = [e for e in all_events if e.stage != PatternStage.DETECTED]
            if rest or pattern.is_terminal():
                self.apply_events(pattern, rest)
        else:
            self.apply_events(pattern, all_events)

    def find_open(self, symbol_id: str, timeframe: str) -> list[ActivePattern]:
        with self._lock:
            return [
                p
                for p in self._instances.values()
                if p.symbol_id == symbol_id
                and p.timeframe == timeframe
                and not p.is_terminal()
            ]

    def find_open_for_symbol(self, symbol_id: str) -> list[ActivePattern]:
        with self._lock:
            return [
                p
                for p in self._instances.values()
                if p.symbol_id == symbol_id and not p.is_terminal()
            ]

    def find_open_by_timeframes(
        self, timeframes: set[str] | list[str]
    ) -> list[ActivePattern]:
        tfs = set(timeframes or [])
        if not tfs:
            return []
        with self._lock:
            return [
                p
                for p in self._instances.values()
                if p.timeframe in tfs and not p.is_terminal()
            ]

    def find_recent(
        self, symbol_id: str, status_filter: str, limit: int
    ) -> list[ActivePattern]:
        with self._lock:
            items = [p for p in self._instances.values() if p.symbol_id == symbol_id]
            f = (status_filter or "active").lower()
            if f == "active":
                items = [p for p in items if not p.is_terminal()]
            elif f == "closed":
                items = [p for p in items if p.is_terminal()]
            items.sort(key=lambda p: p.detected_at, reverse=True)
            return items[: max(1, limit)]

    def find_by_id(self, pattern_id) -> ActivePattern | None:
        try:
            from uuid import UUID

            pid = pattern_id if isinstance(pattern_id, UUID) else UUID(str(pattern_id))
        except (TypeError, ValueError):
            return None
        with self._lock:
            return self._instances.get(pid)

    def find_statistics(
        self, symbol_id: str, pattern_type: str, timeframe: str
    ) -> PatternStatisticsSnapshot | None:
        key = (symbol_id, pattern_type.lower(), timeframe)
        with self._lock:
            return self._stats.get(key)

    def find_statistics_for_symbols(
        self,
        symbol_ids: list[str],
        pattern_type: str | None,
        timeframe: str | None,
    ) -> list[PatternStatisticsSnapshot]:
        ids = set(symbol_ids)
        with self._lock:
            out = []
            for (sid, ptype, tf), snap in self._stats.items():
                if sid not in ids:
                    continue
                if pattern_type and ptype != pattern_type.lower():
                    continue
                if timeframe and tf != timeframe:
                    continue
                out.append(snap)
            return out

    def list_session_day_alerts(
        self,
        *,
        day=None,
        limit: int = 500,
        symbol_id: str | None = None,
        timeframe: str | None = None,
        include_expired: bool = False,
    ) -> list[dict]:
        from datetime import date as date_cls
        from zoneinfo import ZoneInfo

        ist = ZoneInfo("Asia/Kolkata")
        ist_day = day or datetime.now(tz=ist).date()
        if not isinstance(ist_day, date_cls):
            ist_day = datetime.now(tz=ist).date()
        start = datetime(ist_day.year, ist_day.month, ist_day.day, tzinfo=ist)
        start_epoch = int(start.timestamp())
        end_epoch = start_epoch + 86400 - 1
        lim = max(1, min(int(limit or 500), 2000))
        alerts: list[dict] = []
        with self._lock:
            for pid, events in self._events.items():
                inst = self._instances.get(pid)
                if inst is None:
                    continue
                if symbol_id and inst.symbol_id != symbol_id:
                    continue
                if timeframe and inst.timeframe != timeframe:
                    continue
                for ev in events:
                    ct = int(ev.candle_time or 0)
                    if ct >= 1_000_000_000_000:
                        ct = ct // 1000
                    et = getattr(ev, "at", None)
                    in_day_candle = start_epoch <= ct <= end_epoch
                    in_day_event = False
                    if et is not None:
                        if et.tzinfo is None:
                            et = et.replace(tzinfo=timezone.utc)
                        in_day_event = et.astimezone(ist).date() == ist_day
                    if not (in_day_candle or in_day_event):
                        continue
                    stage = (
                        ev.stage.value if hasattr(ev.stage, "value") else str(ev.stage)
                    ).lower()
                    if not include_expired and stage == "expired":
                        continue
                    price = float(ev.price)
                    iid = str(inst.id)
                    alerts.append(
                        {
                            "id": f"{iid}:{stage}:{ct}:{price}",
                            "symbolId": inst.symbol_id,
                            "timeframe": inst.timeframe,
                            "patternType": inst.pattern_type.value
                            if hasattr(inst.pattern_type, "value")
                            else str(inst.pattern_type),
                            "stage": stage,
                            "price": price,
                            "time": ct,
                            "referenceLevel": float(inst.reference_level),
                            "instanceId": iid,
                            "direction": inst.direction.value
                            if hasattr(inst.direction, "value")
                            else str(inst.direction),
                            "status": inst.status.value
                            if hasattr(inst.status, "value")
                            else str(inst.status),
                            "receivedAt": int(et.timestamp() * 1000)
                            if et is not None
                            else int(ct * 1000),
                            "entryPrice": float(inst.entry_price),
                            "stopLevel": float(inst.stop_level),
                            "targetLevel": float(inst.target_level)
                            if inst.target_level is not None
                            else None,
                            "atrAtDetect": float(inst.atr_at_detect),
                        }
                    )
        alerts.sort(key=lambda a: (a["time"], a["receivedAt"]), reverse=True)
        return alerts[:lim]

    def _upsert_stats(self, pattern: ActivePattern) -> None:
        key = (pattern.symbol_id, pattern.pattern_type.value, pattern.timeframe)
        snap = self._stats.get(key) or PatternStatisticsSnapshot(
            symbol_id=pattern.symbol_id,
            pattern_type=pattern.pattern_type.value,
            timeframe=pattern.timeframe,
        )
        sums = self._stat_sums.setdefault(
            key,
            {
                "move": 0.0,
                "move_n": 0,
                "mfe": 0.0,
                "mfe_n": 0,
                "mae": 0.0,
                "mae_n": 0,
                "dur": 0.0,
                "dur_n": 0,
                "risk_r": 0.0,
                "reward_r": 0.0,
                "planned_n": 0,
                "planned_rrs": [],
            },
        )
        snap.sample_size += 1
        if pattern.final_outcome == FinalOutcome.SUCCEEDED:
            snap.success_count += 1
        elif pattern.final_outcome == FinalOutcome.FAILED:
            snap.fail_count += 1
        elif pattern.final_outcome == FinalOutcome.EXPIRED:
            snap.expired_count += 1

        snap.success_rate = snap.success_count / snap.sample_size if snap.sample_size else 0.0
        resolved = snap.success_count + snap.fail_count
        snap.resolved_sample_size = resolved
        snap.resolved_success_rate = (
            snap.success_count / resolved if resolved else None
        )

        if not pattern.suppress_excursion_stats:
            mr = pattern.move_r()
            if mr is not None:
                sums["move"] += mr
                sums["move_n"] += 1
            sums["mfe"] += pattern.max_favorable_r()
            sums["mfe_n"] += 1
            sums["mae"] += pattern.max_adverse_r()
            sums["mae_n"] += 1
            rails = planned_rails_from_pattern(pattern)
            if rails is not None:
                sums["risk_r"] += rails.risk_r
                sums["reward_r"] += rails.reward_r
                sums["planned_n"] += 1
                rrs: list = sums["planned_rrs"]
                rrs.append(rails.planned_rr)
        sums["dur"] += pattern.duration_candles
        sums["dur_n"] += 1

        snap.move_sample_size = sums["move_n"]
        snap.mfe_sample_size = sums["mfe_n"]
        snap.mae_sample_size = sums["mae_n"]
        snap.avg_move_r = sums["move"] / sums["move_n"] if sums["move_n"] else 0.0
        snap.avg_mfe_r = sums["mfe"] / sums["mfe_n"] if sums["mfe_n"] else 0.0
        snap.avg_mae_r = sums["mae"] / sums["mae_n"] if sums["mae_n"] else 0.0
        snap.planned_rr_sample_size = sums["planned_n"]
        snap.avg_risk_r = sums["risk_r"] / sums["planned_n"] if sums["planned_n"] else 0.0
        snap.avg_reward_r = (
            sums["reward_r"] / sums["planned_n"] if sums["planned_n"] else 0.0
        )
        # Plan R:R = ratio of averages (not mean of per-trade RRs)
        snap.avg_planned_rr = (
            snap.avg_reward_r / snap.avg_risk_r
            if snap.avg_risk_r > 0 and snap.avg_reward_r > 0
            else 0.0
        )
        rrs_list: list[float] = list(sums["planned_rrs"])
        if rrs_list:
            snap.min_planned_rr = min(rrs_list)
            snap.max_planned_rr = max(rrs_list)
            med = median_planned_rr(rrs_list)
            snap.median_planned_rr = med if med is not None else 0.0
        else:
            snap.min_planned_rr = 0.0
            snap.max_planned_rr = 0.0
            snap.median_planned_rr = 0.0
        snap.avg_duration_candles = sums["dur"] / sums["dur_n"] if sums["dur_n"] else 0.0
        snap.updated_at = datetime.now(timezone.utc)
        self._stats[key] = snap

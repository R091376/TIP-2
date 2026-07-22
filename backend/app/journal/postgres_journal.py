from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.journal.entities import (
    PatternEventRow,
    PatternInstanceRow,
    PatternOutcomeRow,
    PatternStatisticsRow,
)
from app.journal.mapper import (
    CLOSED_STATUSES,
    OPEN_STATUSES,
    copy_mutable,
    to_domain,
    to_new_row,
)
from app.patterns.journal import PatternStatisticsSnapshot
from app.patterns.models import ActivePattern, FinalOutcome, PatternStage, PatternStageEvent

logger = logging.getLogger(__name__)


class PostgresPatternJournal:
    """Durable pattern journal backed by Postgres (Flyway V2–V4 tables)."""

    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._sf = session_factory

    def is_active(self) -> bool:
        return True

    def insert_detected(
        self, pattern: ActivePattern, detected_event: PatternStageEvent | None
    ) -> None:
        now = datetime.now(timezone.utc)
        with self._sf() as s:
            if s.get(PatternInstanceRow, pattern.id) is not None:
                logger.debug("Pattern instance already exists: %s", pattern.id)
                return
            s.add(to_new_row(pattern, now))
            if detected_event is not None:
                self._insert_event_if_absent(s, detected_event, now)
            s.commit()

    def apply_events(
        self, pattern: ActivePattern, stage_events: list[PatternStageEvent]
    ) -> None:
        self._persist_mutable_and_events(pattern, stage_events or [], datetime.now(timezone.utc))

    def persist_lifecycle(
        self, pattern: ActivePattern, all_events: list[PatternStageEvent] | None
    ) -> None:
        now = datetime.now(timezone.utc)
        events = all_events or []
        with self._sf() as s:
            if s.get(PatternInstanceRow, pattern.id) is None:
                s.add(to_new_row(pattern, now))
                s.flush()
            self._persist_mutable_and_events_in_session(s, pattern, events, now)
            s.commit()

    def find_open(self, symbol_id: str, timeframe: str) -> list[ActivePattern]:
        with self._sf() as s:
            rows = s.scalars(
                select(PatternInstanceRow).where(
                    PatternInstanceRow.symbol_id == symbol_id,
                    PatternInstanceRow.timeframe == timeframe,
                    PatternInstanceRow.status.in_(OPEN_STATUSES),
                )
            ).all()
            return [to_domain(r) for r in rows]

    def find_open_for_symbol(self, symbol_id: str) -> list[ActivePattern]:
        with self._sf() as s:
            rows = s.scalars(
                select(PatternInstanceRow).where(
                    PatternInstanceRow.symbol_id == symbol_id,
                    PatternInstanceRow.status.in_(OPEN_STATUSES),
                )
            ).all()
            return [to_domain(r) for r in rows]

    def find_open_by_timeframes(self, timeframes: set[str] | list[str]) -> list[ActivePattern]:
        if not timeframes:
            return []
        with self._sf() as s:
            rows = s.scalars(
                select(PatternInstanceRow).where(
                    PatternInstanceRow.timeframe.in_(list(timeframes)),
                    PatternInstanceRow.status.in_(OPEN_STATUSES),
                )
            ).all()
            return [to_domain(r) for r in rows]

    def find_recent(
        self, symbol_id: str, status_filter: str, limit: int
    ) -> list[ActivePattern]:
        f = (status_filter or "all").strip().lower()
        with self._sf() as s:
            q = select(PatternInstanceRow).where(PatternInstanceRow.symbol_id == symbol_id)
            if f == "active":
                q = q.where(PatternInstanceRow.status.in_(OPEN_STATUSES))
            elif f == "closed":
                q = q.where(PatternInstanceRow.status.in_(CLOSED_STATUSES))
            q = q.order_by(PatternInstanceRow.detected_at.desc()).limit(max(1, limit))
            rows = s.scalars(q).all()
            return [to_domain(r) for r in rows]

    def find_statistics(
        self, symbol_id: str, pattern_type: str, timeframe: str
    ) -> PatternStatisticsSnapshot | None:
        with self._sf() as s:
            row = s.get(
                PatternStatisticsRow,
                {
                    "symbol_id": symbol_id,
                    "pattern_type": pattern_type.lower(),
                    "timeframe": timeframe,
                },
            )
            return self._to_snapshot(row) if row else None

    def find_statistics_for_symbols(
        self,
        symbol_ids: list[str],
        pattern_type: str | None,
        timeframe: str | None,
    ) -> list[PatternStatisticsSnapshot]:
        if not symbol_ids:
            return []
        type_filter = (pattern_type or "").strip().lower() or None
        tf_filter = (timeframe or "").strip() or None
        with self._sf() as s:
            rows = s.scalars(
                select(PatternStatisticsRow).where(
                    PatternStatisticsRow.symbol_id.in_(list(symbol_ids))
                )
            ).all()
            out: list[PatternStatisticsSnapshot] = []
            for r in rows:
                if type_filter and r.pattern_type.lower() != type_filter:
                    continue
                if tf_filter and r.timeframe != tf_filter:
                    continue
                out.append(self._to_snapshot(r))
            return out

    # --- internals ---

    def _persist_mutable_and_events(
        self,
        pattern: ActivePattern,
        stage_events: list[PatternStageEvent],
        now: datetime,
    ) -> None:
        with self._sf() as s:
            self._persist_mutable_and_events_in_session(s, pattern, stage_events, now)
            s.commit()

    def _persist_mutable_and_events_in_session(
        self,
        s: Session,
        pattern: ActivePattern,
        stage_events: list[PatternStageEvent],
        now: datetime,
    ) -> None:
        if not stage_events and not pattern.is_terminal():
            row = s.get(PatternInstanceRow, pattern.id)
            if row is not None:
                copy_mutable(pattern, row, now)
            return

        row = s.get(PatternInstanceRow, pattern.id)
        if row is None:
            s.add(to_new_row(pattern, now))
            s.flush()
            row = s.get(PatternInstanceRow, pattern.id)
            assert row is not None

        for ev in stage_events:
            self._insert_event_if_absent(s, ev, now)

        copy_mutable(pattern, row, now)

        if pattern.is_terminal() and pattern.final_outcome is not None:
            existing = s.get(PatternOutcomeRow, pattern.id)
            if existing is None:
                s.add(self._build_outcome(pattern, now))
                self._upsert_statistics(s, pattern, now)

    def _insert_event_if_absent(
        self, s: Session, ev: PatternStageEvent, now: datetime
    ) -> None:
        event_type = ev.stage.value
        exists = s.scalars(
            select(PatternEventRow).where(
                PatternEventRow.pattern_instance_id == ev.pattern_id,
                PatternEventRow.event_type == event_type,
            )
        ).first()
        if exists is not None:
            return
        s.add(
            PatternEventRow(
                pattern_instance_id=ev.pattern_id,
                event_type=event_type,
                event_time=_utc(ev.at) or now,
                candle_time=ev.candle_time,
                price_at_event=ev.price,
                metadata_json=None,
                created_at=now,
            )
        )

    def _build_outcome(self, p: ActivePattern, now: datetime) -> PatternOutcomeRow:
        reason = p.terminal_reason
        skip = p.suppress_excursion_stats or reason == "startup_recovery"
        seconds = 0
        if p.detected_at is not None:
            det = p.detected_at
            if det.tzinfo is None:
                det = det.replace(tzinfo=timezone.utc)
            seconds = max(0, int((now - det).total_seconds()))
        return PatternOutcomeRow(
            pattern_instance_id=p.id,
            final_outcome=p.final_outcome.value if p.final_outcome else "expired",
            duration_candles=p.duration_candles,
            duration_seconds=seconds,
            max_favorable_r=None if skip else p.max_favorable_r(),
            max_adverse_r=None if skip else p.max_adverse_r(),
            max_favorable_price=None if skip else p.favorable_extreme_price(),
            max_adverse_price=None if skip else p.adverse_extreme_price(),
            move_r=None if skip else p.move_r(),
            end_price=None if skip else p.end_price,
            reason=reason,
            closed_at=now,
        )

    def _upsert_statistics(self, s: Session, p: ActivePattern, now: datetime) -> None:
        ptype = p.pattern_type.value
        row = s.get(
            PatternStatisticsRow,
            {
                "symbol_id": p.symbol_id,
                "pattern_type": ptype,
                "timeframe": p.timeframe,
            },
        )
        if row is None:
            row = PatternStatisticsRow(
                symbol_id=p.symbol_id,
                pattern_type=ptype,
                timeframe=p.timeframe,
                sample_size=0,
                success_count=0,
                fail_count=0,
                expired_count=0,
                success_rate=0.0,
                resolved_success_rate=None,
                avg_move_r=0.0,
                avg_duration_candles=0.0,
                avg_mfe_r=0.0,
                avg_mae_r=0.0,
                move_sample_size=0,
                mfe_sample_size=0,
                mae_sample_size=0,
                updated_at=now,
            )
            s.add(row)

        prev_sample = row.sample_size
        row.sample_size = prev_sample + 1
        fo = p.final_outcome
        if fo == FinalOutcome.SUCCEEDED:
            row.success_count += 1
        elif fo == FinalOutcome.FAILED:
            row.fail_count += 1
        else:
            row.expired_count += 1

        sample = row.sample_size
        row.success_rate = (row.success_count / sample) if sample else 0.0
        resolved = row.success_count + row.fail_count
        row.resolved_success_rate = (
            (row.success_count / resolved) if resolved else None
        )
        row.avg_duration_candles = _running_avg(
            row.avg_duration_candles, prev_sample, float(p.duration_candles), sample
        )

        skip = p.suppress_excursion_stats or p.terminal_reason == "startup_recovery"
        if not skip:
            move = p.move_r()
            if move is not None:
                n = row.move_sample_size
                row.avg_move_r = _running_avg(row.avg_move_r, n, move, n + 1)
                row.move_sample_size = n + 1
            nm = row.mfe_sample_size
            row.avg_mfe_r = _running_avg(row.avg_mfe_r, nm, p.max_favorable_r(), nm + 1)
            row.mfe_sample_size = nm + 1
            na = row.mae_sample_size
            row.avg_mae_r = _running_avg(row.avg_mae_r, na, p.max_adverse_r(), na + 1)
            row.mae_sample_size = na + 1

        row.updated_at = now

    @staticmethod
    def _to_snapshot(s: PatternStatisticsRow) -> PatternStatisticsSnapshot:
        return PatternStatisticsSnapshot(
            symbol_id=s.symbol_id,
            pattern_type=s.pattern_type,
            timeframe=s.timeframe,
            sample_size=s.sample_size,
            success_count=s.success_count,
            fail_count=s.fail_count,
            expired_count=s.expired_count,
            success_rate=s.success_rate,
            resolved_success_rate=s.resolved_success_rate,
            resolved_sample_size=s.success_count + s.fail_count,
            avg_move_r=s.avg_move_r,
            avg_duration_candles=s.avg_duration_candles,
            avg_mfe_r=s.avg_mfe_r,
            avg_mae_r=s.avg_mae_r,
            move_sample_size=s.move_sample_size,
            mfe_sample_size=s.mfe_sample_size,
            mae_sample_size=s.mae_sample_size,
            updated_at=s.updated_at
            if s.updated_at.tzinfo
            else s.updated_at.replace(tzinfo=timezone.utc),
        )


def _running_avg(prev_avg: float, prev_n: int, value: float, new_n: int) -> float:
    if new_n <= 0:
        return 0.0
    if prev_n <= 0:
        return value
    return (prev_avg * prev_n + value) / new_n


def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

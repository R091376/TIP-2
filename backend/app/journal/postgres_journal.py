from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session, sessionmaker

from app.journal.entities import (
    PatternEventRow,
    PatternInstanceRow,
    PatternOutcomeRow,
    PatternStatisticsRow,
)

_IST = ZoneInfo("Asia/Kolkata")


def _as_epoch_seconds(value: int | float | None) -> int:
    """Normalize candle timestamps: ms (≈1e12) → seconds (≈1e9)."""
    try:
        v = int(value or 0)
    except (TypeError, ValueError):
        return 0
    # Threshold: year ~2001 in ms is 1e12; seconds stay < 1e11 for centuries
    if v >= 1_000_000_000_000:
        return v // 1000
    return v


from app.journal.mapper import (
    CLOSED_STATUSES,
    OPEN_STATUSES,
    copy_mutable,
    to_domain,
    to_new_row,
)
from app.patterns.journal import PatternStatisticsSnapshot
from app.patterns.models import ActivePattern, FinalOutcome, PatternStage, PatternStageEvent
from app.patterns.planned_rails import (
    compute_planned_rails,
    median_planned_rr,
    planned_rails_from_pattern,
)

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
            # Same detect fingerprint already journaled under another UUID — no-op.
            if self._find_row_by_fingerprint(s, pattern) is not None:
                logger.info(
                    "Skip insert_detected: fingerprint exists for %s %s %s t=%s",
                    pattern.symbol_id,
                    pattern.pattern_type.value,
                    pattern.timeframe,
                    pattern.detect_candle_time,
                )
                return
            s.add(to_new_row(pattern, now))
            if detected_event is not None:
                self._insert_event_if_absent(s, detected_event, now)
            s.commit()

    def apply_events(
        self, pattern: ActivePattern, stage_events: list[PatternStageEvent]
    ) -> None:
        self._persist_mutable_and_events(pattern, stage_events or [], datetime.now(timezone.utc))

    def purge_instance(self, pattern_id: UUID) -> bool:
        """Delete instance + all events/outcomes. No expired event written."""
        with self._sf() as s:
            row = s.get(PatternInstanceRow, pattern_id)
            if row is None:
                return False
            self._delete_instance_graph(s, pattern_id)
            s.commit()
            return True

    def purge_by_outcome_reason(self, reason: str) -> int:
        """Remove instances whose terminal outcome reason matches (and all events)."""
        if not reason:
            return 0
        with self._sf() as s:
            ids = list(
                s.scalars(
                    select(PatternOutcomeRow.pattern_instance_id).where(
                        PatternOutcomeRow.reason == reason
                    )
                ).all()
            )
            n = 0
            for pid in ids:
                if s.get(PatternInstanceRow, pid) is not None:
                    self._delete_instance_graph(s, pid)
                    n += 1
            if n:
                s.commit()
            return n

    @staticmethod
    def _delete_instance_graph(s: Session, pattern_id: UUID) -> None:
        """Portable cascade (SQLite tests often lack FK PRAGMA)."""
        s.query(PatternEventRow).filter(
            PatternEventRow.pattern_instance_id == pattern_id
        ).delete(synchronize_session=False)
        s.query(PatternOutcomeRow).filter(
            PatternOutcomeRow.pattern_instance_id == pattern_id
        ).delete(synchronize_session=False)
        row = s.get(PatternInstanceRow, pattern_id)
        if row is not None:
            s.delete(row)

    def persist_lifecycle(
        self, pattern: ActivePattern, all_events: list[PatternStageEvent] | None
    ) -> None:
        now = datetime.now(timezone.utc)
        events = all_events or []
        with self._sf() as s:
            self._ensure_instance_row(s, pattern, now)
            self._persist_mutable_and_events_in_session(s, pattern, events, now)
            s.commit()

    def find_by_id(self, pattern_id: str | UUID) -> ActivePattern | None:
        try:
            pid = pattern_id if isinstance(pattern_id, UUID) else UUID(str(pattern_id))
        except (TypeError, ValueError):
            return None
        with self._sf() as s:
            row = s.get(PatternInstanceRow, pid)
            return to_domain(row) if row is not None else None

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

    def list_session_day_alerts(
        self,
        *,
        day: date | None = None,
        limit: int = 500,
        symbol_id: str | None = None,
        timeframe: str | None = None,
        include_expired: bool = False,
    ) -> list[dict]:
        """Pattern stage events for an IST calendar day (default: today).

        Returns alert DTOs newest-first for the FE alerts feed after refresh.

        Matching is robust to:
        - ``event_time`` on the IST calendar day (primary — when the stage fired)
        - ``candle_time`` in epoch **seconds** or **milliseconds**
        """
        ist_day = day or datetime.now(tz=_IST).date()
        start_ist = datetime.combine(ist_day, time(0, 0), tzinfo=_IST)
        # Exclusive end = next midnight IST (avoids microsecond edge cases)
        end_ist_excl = start_ist + timedelta(days=1)
        start_utc = start_ist.astimezone(timezone.utc)
        end_utc_excl = end_ist_excl.astimezone(timezone.utc)
        start_epoch = int(start_ist.timestamp())
        end_epoch = int(end_ist_excl.timestamp()) - 1  # inclusive seconds
        start_epoch_ms = start_epoch * 1000
        end_epoch_ms = end_epoch * 1000 + 999

        lim = max(1, min(int(limit or 500), 2000))
        with self._sf() as s:
            q = (
                select(PatternEventRow, PatternInstanceRow)
                .join(
                    PatternInstanceRow,
                    PatternEventRow.pattern_instance_id == PatternInstanceRow.id,
                )
                .where(
                    or_(
                        # When the stage was recorded (most reliable for refresh)
                        (PatternEventRow.event_time >= start_utc)
                        & (PatternEventRow.event_time < end_utc_excl),
                        # Candle bucket in seconds
                        (PatternEventRow.candle_time >= start_epoch)
                        & (PatternEventRow.candle_time <= end_epoch),
                        # Candle bucket mistakenly stored as ms
                        (PatternEventRow.candle_time >= start_epoch_ms)
                        & (PatternEventRow.candle_time <= end_epoch_ms),
                    )
                )
            )
            if not include_expired:
                q = q.where(PatternEventRow.event_type != "expired")
            if symbol_id:
                q = q.where(PatternInstanceRow.symbol_id == symbol_id)
            if timeframe:
                q = q.where(PatternInstanceRow.timeframe == timeframe)
            q = q.order_by(
                PatternEventRow.event_time.desc(),
                PatternEventRow.candle_time.desc(),
                PatternEventRow.id.desc(),
            ).limit(lim * 3)
            rows = s.execute(q).all()

        alerts: list[dict] = []
        for ev, inst in rows:
            ct = _as_epoch_seconds(ev.candle_time)
            et = ev.event_time
            if et is not None and et.tzinfo is None:
                et = et.replace(tzinfo=timezone.utc)
            in_day_candle = start_epoch <= ct <= end_epoch
            in_day_event = False
            if et is not None:
                in_day_event = et.astimezone(_IST).date() == ist_day
            if not (in_day_candle or in_day_event):
                continue
            stage = (ev.event_type or "").lower()
            if not include_expired and stage == "expired":
                continue
            price = float(ev.price_at_event)
            iid = str(inst.id)
            alert_id = f"{iid}:{stage}:{ct}:{price}"
            received_ms = int(et.timestamp() * 1000) if et else int(ct * 1000)
            alerts.append(
                {
                    "id": alert_id,
                    "symbolId": inst.symbol_id,
                    "timeframe": inst.timeframe,
                    "patternType": inst.pattern_type,
                    "stage": stage,
                    "price": price,
                    "time": ct,
                    "referenceLevel": float(inst.reference_level),
                    "instanceId": iid,
                    "direction": inst.direction,
                    "status": inst.status,
                    "receivedAt": received_ms,
                    # Rails available from detect (not only success/fail)
                    "entryPrice": float(inst.entry_price),
                    "stopLevel": float(inst.stop_level),
                    "targetLevel": float(inst.target_level)
                    if inst.target_level is not None
                    else None,
                    "atrAtDetect": float(inst.atr_at_detect),
                }
            )
            if len(alerts) >= lim:
                break
        return alerts

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

    def _find_row_by_fingerprint(
        self, s: Session, pattern: ActivePattern
    ) -> PatternInstanceRow | None:
        ptype = (
            pattern.pattern_type.value
            if hasattr(pattern.pattern_type, "value")
            else str(pattern.pattern_type)
        )
        return s.scalars(
            select(PatternInstanceRow).where(
                PatternInstanceRow.symbol_id == pattern.symbol_id,
                PatternInstanceRow.pattern_type == ptype,
                PatternInstanceRow.timeframe == pattern.timeframe,
                PatternInstanceRow.detect_candle_time == int(pattern.detect_candle_time),
                PatternInstanceRow.reference_level == float(pattern.reference_level),
            )
        ).first()

    def _ensure_instance_row(
        self, s: Session, pattern: ActivePattern, now: datetime
    ) -> PatternInstanceRow:
        """Return the DB row for this pattern; avoid fingerprint UniqueViolation."""
        row = s.get(PatternInstanceRow, pattern.id)
        if row is not None:
            return row
        existing = self._find_row_by_fingerprint(s, pattern)
        if existing is not None:
            logger.info(
                "Reuse journal row %s for fingerprint (incoming id %s)",
                existing.id,
                pattern.id,
            )
            return existing
        s.add(to_new_row(pattern, now))
        s.flush()
        row = s.get(PatternInstanceRow, pattern.id)
        assert row is not None
        return row

    def _persist_mutable_and_events_in_session(
        self,
        s: Session,
        pattern: ActivePattern,
        stage_events: list[PatternStageEvent],
        now: datetime,
    ) -> None:
        if not stage_events and not pattern.is_terminal():
            row = s.get(PatternInstanceRow, pattern.id)
            if row is None:
                row = self._find_row_by_fingerprint(s, pattern)
            if row is not None:
                copy_mutable(pattern, row, now)
            return

        row = self._ensure_instance_row(s, pattern, now)
        # Events/outcomes attach to the durable row id (may differ if fingerprint reused).
        durable_id = row.id

        for ev in stage_events:
            self._insert_event_if_absent(s, ev, now, instance_id=durable_id)

        copy_mutable(pattern, row, now)

        if pattern.is_terminal() and pattern.final_outcome is not None:
            existing = s.get(PatternOutcomeRow, durable_id)
            if existing is None:
                s.add(self._build_outcome(pattern, now, instance_id=durable_id))
                self._upsert_statistics(
                    s, pattern, now, instance_id=durable_id
                )

    def _insert_event_if_absent(
        self,
        s: Session,
        ev: PatternStageEvent,
        now: datetime,
        instance_id: UUID | None = None,
    ) -> None:
        event_type = ev.stage.value
        pid = instance_id if instance_id is not None else ev.pattern_id
        exists = s.scalars(
            select(PatternEventRow).where(
                PatternEventRow.pattern_instance_id == pid,
                PatternEventRow.event_type == event_type,
            )
        ).first()
        if exists is not None:
            return
        s.add(
            PatternEventRow(
                pattern_instance_id=pid,
                event_type=event_type,
                event_time=_utc(ev.at) or now,
                candle_time=ev.candle_time,
                price_at_event=ev.price,
                metadata_json=None,
                created_at=now,
            )
        )

    def _build_outcome(
        self,
        p: ActivePattern,
        now: datetime,
        instance_id: UUID | None = None,
    ) -> PatternOutcomeRow:
        reason = p.terminal_reason
        skip = p.suppress_excursion_stats or reason == "startup_recovery"
        seconds = 0
        if p.detected_at is not None:
            det = p.detected_at
            if det.tzinfo is None:
                det = det.replace(tzinfo=timezone.utc)
            seconds = max(0, int((now - det).total_seconds()))
        return PatternOutcomeRow(
            pattern_instance_id=instance_id if instance_id is not None else p.id,
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

    def _upsert_statistics(
        self,
        s: Session,
        p: ActivePattern,
        now: datetime,
        *,
        instance_id: UUID | None = None,
    ) -> None:
        ptype = p.pattern_type.value
        current_id = instance_id if instance_id is not None else p.id
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
                avg_planned_rr=0.0,
                avg_risk_r=0.0,
                avg_reward_r=0.0,
                planned_rr_sample_size=0,
                min_planned_rr=0.0,
                max_planned_rr=0.0,
                median_planned_rr=0.0,
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
            rails = planned_rails_from_pattern(p)
            if rails is not None:
                npr = row.planned_rr_sample_size
                row.avg_risk_r = _running_avg(row.avg_risk_r, npr, rails.risk_r, npr + 1)
                row.avg_reward_r = _running_avg(
                    row.avg_reward_r, npr, rails.reward_r, npr + 1
                )
                ptype = (
                    p.pattern_type.value
                    if hasattr(p.pattern_type, "value")
                    else str(p.pattern_type)
                )
                # Min/max/median from one shared list (avoids DEFAULT-0 min poison
                # and always includes the current trade by instance id).
                lo, hi, med = self._planned_rr_extremes_for_bucket(
                    s,
                    symbol_id=p.symbol_id,
                    pattern_type=ptype,
                    timeframe=p.timeframe,
                    current_id=current_id,
                    current_rr=rails.planned_rr,
                )
                row.min_planned_rr = lo
                row.max_planned_rr = hi
                row.median_planned_rr = med
                row.planned_rr_sample_size = npr + 1
                # Plan R:R = ratio of averages (not mean of per-trade RRs)
                row.avg_planned_rr = _ratio_of_averages(
                    row.avg_reward_r, row.avg_risk_r
                )

        row.updated_at = now

    def _planned_rr_extremes_for_bucket(
        self,
        s: Session,
        *,
        symbol_id: str,
        pattern_type: str,
        timeframe: str,
        current_id: UUID,
        current_rr: float,
    ) -> tuple[float, float, float]:
        """Return (min, max, median) of per-trade planned RRs for a stats bucket.

        Builds the multiset from closed instances (skipping startup_recovery), then
        forces inclusion of the just-closed trade via ``current_id`` → ``current_rr``
        so median always matches the same sample that updated avgs, whether or not
        the row is already visible as CLOSED in this session. Overwriting by id
        prevents double-counting when the scan already contains the current row.
        """
        instances = s.scalars(
            select(PatternInstanceRow).where(
                PatternInstanceRow.symbol_id == symbol_id,
                PatternInstanceRow.pattern_type == pattern_type,
                PatternInstanceRow.timeframe == timeframe,
                PatternInstanceRow.status.in_(tuple(CLOSED_STATUSES)),
            )
        ).all()
        rrs_by_id: dict[UUID, float] = {}
        if instances:
            ids = [i.id for i in instances]
            outcomes = {
                o.pattern_instance_id: o
                for o in s.scalars(
                    select(PatternOutcomeRow).where(
                        PatternOutcomeRow.pattern_instance_id.in_(ids)
                    )
                ).all()
            }
            for inst in instances:
                outcome = outcomes.get(inst.id)
                if outcome is not None and outcome.reason == "startup_recovery":
                    continue
                rails = compute_planned_rails(
                    pattern_type=inst.pattern_type,
                    direction=inst.direction,
                    entry=inst.entry_price,
                    stop=inst.stop_level,
                    target=inst.target_level,
                    atr=inst.atr_at_detect,
                )
                if rails is not None:
                    rrs_by_id[inst.id] = rails.planned_rr

        # Authoritative rails for the trade currently being upserted
        rrs_by_id[current_id] = float(current_rr)

        rrs = list(rrs_by_id.values())
        if not rrs:
            return 0.0, 0.0, 0.0
        med = median_planned_rr(rrs)
        return min(rrs), max(rrs), (med if med is not None else 0.0)

    def recompute_planned_rails_stats(self) -> dict[str, int]:
        """
        Backfill planned-rails fields from closed pattern_instances.

        avg_planned_rr = avg_reward_r / avg_risk_r (ratio of averages).
        min/max/median are over per-trade planned_rr values.
        Does not rewrite success/fail/MFE aggregates.
        """
        now = datetime.now(timezone.utc)
        with self._sf() as s:
            # Zero planned fields on all stats rows first
            stats_rows = s.scalars(select(PatternStatisticsRow)).all()
            for row in stats_rows:
                row.avg_planned_rr = 0.0
                row.avg_risk_r = 0.0
                row.avg_reward_r = 0.0
                row.planned_rr_sample_size = 0
                row.min_planned_rr = 0.0
                row.max_planned_rr = 0.0
                row.median_planned_rr = 0.0
                row.updated_at = now

            # Aggregate from terminal instances
            instances = s.scalars(
                select(PatternInstanceRow).where(
                    PatternInstanceRow.status.in_(tuple(CLOSED_STATUSES))
                )
            ).all()
            outcomes = {
                o.pattern_instance_id: o
                for o in s.scalars(select(PatternOutcomeRow)).all()
            }

            buckets: dict[tuple[str, str, str], dict] = {}
            included = 0
            skipped = 0
            for inst in instances:
                outcome = outcomes.get(inst.id)
                reason = outcome.reason if outcome is not None else None
                if reason == "startup_recovery":
                    skipped += 1
                    continue
                rails = compute_planned_rails(
                    pattern_type=inst.pattern_type,
                    direction=inst.direction,
                    entry=inst.entry_price,
                    stop=inst.stop_level,
                    target=inst.target_level,
                    atr=inst.atr_at_detect,
                )
                if rails is None:
                    skipped += 1
                    continue
                key = (inst.symbol_id, inst.pattern_type, inst.timeframe)
                b = buckets.setdefault(
                    key,
                    {
                        "risk_r": 0.0,
                        "reward_r": 0.0,
                        "n": 0,
                        "rrs": [],
                    },
                )
                b["risk_r"] = float(b["risk_r"]) + rails.risk_r
                b["reward_r"] = float(b["reward_r"]) + rails.reward_r
                b["n"] = int(b["n"]) + 1
                b["rrs"].append(rails.planned_rr)
                included += 1

            updated_buckets = 0
            for (sid, ptype, tf), b in buckets.items():
                n = int(b["n"])
                if n <= 0:
                    continue
                row = s.get(
                    PatternStatisticsRow,
                    {"symbol_id": sid, "pattern_type": ptype, "timeframe": tf},
                )
                if row is None:
                    # Stats row missing (edge case): create a shell so planned metrics exist
                    row = PatternStatisticsRow(
                        symbol_id=sid,
                        pattern_type=ptype,
                        timeframe=tf,
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
                        avg_planned_rr=0.0,
                        avg_risk_r=0.0,
                        avg_reward_r=0.0,
                        planned_rr_sample_size=0,
                        min_planned_rr=0.0,
                        max_planned_rr=0.0,
                        median_planned_rr=0.0,
                        updated_at=now,
                    )
                    s.add(row)
                rrs: list[float] = list(b["rrs"])
                row.avg_risk_r = float(b["risk_r"]) / n
                row.avg_reward_r = float(b["reward_r"]) / n
                row.avg_planned_rr = _ratio_of_averages(
                    row.avg_reward_r, row.avg_risk_r
                )
                row.planned_rr_sample_size = n
                row.min_planned_rr = min(rrs)
                row.max_planned_rr = max(rrs)
                med = median_planned_rr(rrs)
                row.median_planned_rr = med if med is not None else 0.0
                row.updated_at = now
                updated_buckets += 1

            s.commit()
            return {
                "buckets_updated": updated_buckets,
                "instances_included": included,
                "instances_skipped": skipped,
            }

    def supports_research_aggregation(self) -> bool:
        return True

    def aggregate_filtered(
        self,
        spec,
        *,
        allowed_symbol_ids: list[str],
        symbol_labels: dict[str, tuple[str | None, str | None]] | None = None,
        statement_timeout_ms: int = 5000,
    ) -> dict:
        """
        Query-time research aggregation over closed instances ⨝ outcomes.

        Fetches candidate rows (watchlist + closed + coarse date bounds), filters
        in Python for TOD / flags / rails (parity with compute_planned_rails), then
        aggregates via research_metrics.
        """
        from app.patterns.planned_rails import compute_planned_rails
        from app.patterns.research_filters import (
            as_epoch_seconds,
            row_matches_filters,
        )
        from app.patterns.research_metrics import (
            ResearchRow,
            aggregate_research,
            empty_research_response,
        )

        if not allowed_symbol_ids:
            return empty_research_response(spec)

        # Coarse epoch bounds for detect_candle_time (IST day start/end)
        from_d = spec.detected_from
        to_d = spec.detected_to
        if from_d is None or to_d is None:
            return empty_research_response(spec)

        start_ist = datetime.combine(from_d, time(0, 0), tzinfo=_IST)
        end_ist_excl = datetime.combine(to_d + timedelta(days=1), time(0, 0), tzinfo=_IST)
        start_epoch = int(start_ist.timestamp())
        end_epoch = int(end_ist_excl.timestamp()) - 1
        # Also include ms-stored candle times
        start_epoch_ms = start_epoch * 1000
        end_epoch_ms = end_epoch * 1000 + 999

        allowed_set = set(allowed_symbol_ids)
        timeout_ms = max(500, int(statement_timeout_ms or 5000))

        with self._sf() as s:
            # Bound scan cost on Postgres
            try:
                s.execute(text(f"SET LOCAL statement_timeout = '{int(timeout_ms)}'"))
            except Exception:
                logger.debug("statement_timeout not applied", exc_info=True)

            q = (
                select(PatternInstanceRow, PatternOutcomeRow)
                .join(
                    PatternOutcomeRow,
                    PatternOutcomeRow.pattern_instance_id == PatternInstanceRow.id,
                )
                .where(
                    PatternInstanceRow.symbol_id.in_(list(allowed_symbol_ids)),
                    PatternInstanceRow.status.in_(tuple(CLOSED_STATUSES)),
                    or_(
                        (
                            (PatternInstanceRow.detect_candle_time >= start_epoch)
                            & (PatternInstanceRow.detect_candle_time <= end_epoch)
                        ),
                        (
                            (PatternInstanceRow.detect_candle_time >= start_epoch_ms)
                            & (PatternInstanceRow.detect_candle_time <= end_epoch_ms)
                        ),
                    ),
                )
            )
            if spec.pattern_types:
                q = q.where(PatternInstanceRow.pattern_type.in_(list(spec.pattern_types)))
            if spec.timeframes:
                q = q.where(PatternInstanceRow.timeframe.in_(list(spec.timeframes)))
            if spec.direction:
                q = q.where(PatternInstanceRow.direction == spec.direction)

            try:
                pairs = s.execute(q).all()
            except Exception as exc:
                # statement_timeout surfaces as DBAPI error
                msg = str(exc).lower()
                if "timeout" in msg or "canceling statement" in msg:
                    raise TimeoutError("Research query timed out") from exc
                raise

        matched: list = []
        for inst, outcome in pairs:
            rails = compute_planned_rails(
                pattern_type=inst.pattern_type,
                direction=inst.direction,
                entry=inst.entry_price,
                stop=inst.stop_level,
                target=inst.target_level,
                atr=inst.atr_at_detect,
            )
            planned_rr = rails.planned_rr if rails is not None else None
            risk_r = rails.risk_r if rails is not None else None
            rails_valid = rails is not None
            if not row_matches_filters(
                symbol_id=inst.symbol_id,
                pattern_type=inst.pattern_type,
                timeframe=inst.timeframe,
                direction=inst.direction,
                status=inst.status,
                flag_confirmed=bool(inst.flag_confirmed),
                flag_retested=bool(inst.flag_retested),
                flag_strengthened=bool(inst.flag_strengthened),
                volume_ok_at_detect=bool(inst.volume_ok_at_detect),
                confirmation_mode_used=inst.confirmation_mode_used,
                detector_version=inst.detector_version or "",
                detect_candle_time=int(inst.detect_candle_time or 0),
                final_outcome=outcome.final_outcome,
                reason=outcome.reason,
                planned_rr=planned_rr,
                rails_valid=rails_valid,
                spec=spec,
                allowed_symbol_ids=allowed_set,
                risk_r=risk_r,
            ):
                continue
            matched.append(
                ResearchRow(
                    symbol_id=inst.symbol_id,
                    pattern_type=inst.pattern_type,
                    timeframe=inst.timeframe,
                    direction=inst.direction,
                    status=inst.status,
                    flag_confirmed=bool(inst.flag_confirmed),
                    flag_retested=bool(inst.flag_retested),
                    flag_strengthened=bool(inst.flag_strengthened),
                    volume_ok_at_detect=bool(inst.volume_ok_at_detect),
                    confirmation_mode_used=inst.confirmation_mode_used,
                    detector_version=inst.detector_version or "",
                    detect_candle_time=as_epoch_seconds(inst.detect_candle_time),
                    entry_price=float(inst.entry_price),
                    stop_level=float(inst.stop_level),
                    target_level=inst.target_level,
                    atr_at_detect=float(inst.atr_at_detect or 0),
                    final_outcome=outcome.final_outcome,
                    reason=outcome.reason,
                    duration_candles=int(outcome.duration_candles or 0),
                    max_favorable_r=outcome.max_favorable_r,
                    max_adverse_r=outcome.max_adverse_r,
                    move_r=outcome.move_r,
                )
            )

        return aggregate_research(matched, spec, symbol_labels=symbol_labels)

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
            avg_planned_rr=getattr(s, "avg_planned_rr", 0.0) or 0.0,
            avg_risk_r=getattr(s, "avg_risk_r", 0.0) or 0.0,
            avg_reward_r=getattr(s, "avg_reward_r", 0.0) or 0.0,
            planned_rr_sample_size=int(getattr(s, "planned_rr_sample_size", 0) or 0),
            min_planned_rr=getattr(s, "min_planned_rr", 0.0) or 0.0,
            max_planned_rr=getattr(s, "max_planned_rr", 0.0) or 0.0,
            median_planned_rr=getattr(s, "median_planned_rr", 0.0) or 0.0,
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


def _ratio_of_averages(avg_reward_r: float, avg_risk_r: float) -> float:
    """Planned R:R as avg(reward_r) / avg(risk_r); avoids mean-of-ratios skew."""
    if avg_risk_r is None or not (avg_risk_r > 0):
        return 0.0
    if avg_reward_r is None or not (avg_reward_r > 0):
        return 0.0
    return float(avg_reward_r) / float(avg_risk_r)


def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

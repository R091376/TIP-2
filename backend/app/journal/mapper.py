from __future__ import annotations

from datetime import datetime, timezone

from app.journal.entities import PatternInstanceRow
from app.patterns.models import (
    ActivePattern,
    ConfirmationMode,
    FinalOutcome,
    PatternDirection,
    PatternStage,
    PatternType,
    new_pattern,
)

OPEN_STATUSES = frozenset({"detected", "confirmed", "retested", "strengthened"})
CLOSED_STATUSES = frozenset({"succeeded", "failed", "expired"})


def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def to_new_row(p: ActivePattern, now: datetime) -> PatternInstanceRow:
    return PatternInstanceRow(
        id=p.id,
        symbol_id=p.symbol_id,
        pattern_type=p.pattern_type.value,
        timeframe=p.timeframe,
        direction=p.direction.value,
        status=p.status.value,
        flag_confirmed=p.flag_confirmed,
        flag_retested=p.flag_retested,
        flag_strengthened=p.flag_strengthened,
        volume_ok_at_detect=p.volume_ok_at_detect,
        reference_level=p.reference_level,
        lookback_high=p.lookback_high,
        atr_at_detect=p.atr_at_detect,
        volume_at_detect=p.volume_at_detect,
        confirmation_mode_used=p.confirmation_mode_used.value,
        entry_price=p.entry_price,
        stop_level=p.stop_level,
        target_level=p.target_level,
        retest_floor=p.retest_floor,
        detector_version=p.detector_version,
        detected_at=_utc(p.detected_at) or now,
        confirmed_at=_utc(p.confirmed_at),
        ended_at=now if p.is_terminal() else None,
        detect_candle_time=p.detect_candle_time,
        sessions_seen=p.sessions_seen,
        created_at=now,
        updated_at=now,
    )


def copy_mutable(p: ActivePattern, row: PatternInstanceRow, now: datetime) -> None:
    row.status = p.status.value
    row.flag_confirmed = p.flag_confirmed
    row.flag_retested = p.flag_retested
    row.flag_strengthened = p.flag_strengthened
    row.target_level = p.target_level
    row.retest_floor = p.retest_floor
    row.confirmed_at = _utc(p.confirmed_at)
    row.sessions_seen = p.sessions_seen
    row.updated_at = now
    if p.is_terminal():
        row.ended_at = now


def parse_confirmation_mode(raw: str | None) -> ConfirmationMode:
    if not raw:
        return ConfirmationMode.BOTH
    key = raw.strip().lower().replace("-", "_")
    try:
        return ConfirmationMode(key)
    except ValueError:
        return ConfirmationMode.BOTH


def to_domain(row: PatternInstanceRow) -> ActivePattern:
    status = PatternStage(row.status.lower())
    ptype = PatternType(row.pattern_type.lower())
    direction = PatternDirection(row.direction.lower())
    p = new_pattern(
        id=row.id,
        pattern_type=ptype,
        symbol_id=row.symbol_id,
        timeframe=row.timeframe,
        direction=direction,
        status=status,
        flag_confirmed=row.flag_confirmed,
        flag_retested=row.flag_retested,
        flag_strengthened=row.flag_strengthened,
        volume_ok_at_detect=row.volume_ok_at_detect,
        confirmation_mode_used=parse_confirmation_mode(row.confirmation_mode_used),
        reference_level=row.reference_level,
        lookback_high=row.lookback_high,
        atr_at_detect=row.atr_at_detect,
        volume_at_detect=int(row.volume_at_detect or 0),
        entry_price=row.entry_price,
        stop_level=row.stop_level,
        target_level=row.target_level if row.target_level is not None else row.reference_level,
        retest_floor=row.retest_floor,
        detect_candle_time=int(row.detect_candle_time),
        detected_at=_utc(row.detected_at),
        confirmed_at=_utc(row.confirmed_at),
        mfe_price=row.entry_price,
        mae_price=row.entry_price,
        duration_candles=1,
        sessions_seen=row.sessions_seen,
        detector_version=row.detector_version,
    )
    if status in (PatternStage.SUCCEEDED, PatternStage.FAILED, PatternStage.EXPIRED):
        outcome = {
            PatternStage.SUCCEEDED: FinalOutcome.SUCCEEDED,
            PatternStage.FAILED: FinalOutcome.FAILED,
            PatternStage.EXPIRED: FinalOutcome.EXPIRED,
        }[status]
        p.mark_terminal(outcome, status, "loaded_terminal", None)
    return p

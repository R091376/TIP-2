"""Daily in-memory snapshot of closed journal rows.

Request-path contract
---------------------
Any API that reads closed instance+outcome (\"events\") data — Research
and future analytics — MUST go through this snapshot
(``PostgresPatternJournal.closed_event_snapshot``). Do not add per-request
SQL over ``pattern_instances`` / ``pattern_outcomes``.

Postgres is hit only by the daily loader (startup / IST-day refresh). Filter
and aggregation then run in process until the next refresh.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Callable, Iterable

from app.patterns.research_filters import IST, row_matches_filters, today_ist
from app.patterns.research_metrics import ResearchRow

logger = logging.getLogger(__name__)

DEFAULT_TTL_SECONDS = 86_400


@dataclass(frozen=True)
class ResearchSnapshot:
    """Immutable closed-row snapshot used for in-memory research filters."""

    rows: tuple[ResearchRow, ...]
    loaded_at: datetime
    window_from: date
    window_to: date

    @property
    def row_count(self) -> int:
        return len(self.rows)

    def loaded_ist_date(self) -> date:
        loaded = self.loaded_at
        if loaded.tzinfo is None:
            loaded = loaded.replace(tzinfo=timezone.utc)
        return loaded.astimezone(IST).date()

    def meta(self, *, hit: bool) -> dict:
        return {
            "hit": hit,
            "source": "memory" if hit else "db",
            "loadedAt": self.loaded_at.isoformat(),
            "rowCount": self.row_count,
            "windowFrom": self.window_from.isoformat(),
            "windowTo": self.window_to.isoformat(),
        }


def match_research_row(
    row: ResearchRow,
    spec,
    allowed_symbol_ids: set[str],
) -> bool:
    rails = row.rails()
    return row_matches_filters(
        symbol_id=row.symbol_id,
        pattern_type=row.pattern_type,
        timeframe=row.timeframe,
        direction=row.direction,
        status=row.status,
        flag_confirmed=row.flag_confirmed,
        flag_retested=row.flag_retested,
        flag_strengthened=row.flag_strengthened,
        volume_ok_at_detect=row.volume_ok_at_detect,
        confirmation_mode_used=row.confirmation_mode_used,
        detector_version=row.detector_version,
        detect_candle_time=row.detect_candle_time,
        final_outcome=row.final_outcome,
        reason=row.reason,
        planned_rr=rails.planned_rr if rails is not None else None,
        rails_valid=rails is not None,
        spec=spec,
        allowed_symbol_ids=allowed_symbol_ids,
        risk_r=rails.risk_r if rails is not None else None,
        sr_nearest=row.sr_nearest,
        sr_cross=row.sr_cross,
        sr_near=row.sr_near,
        sr_confluence=row.sr_confluence,
        sr_break=row.sr_break,
        sr_open_through=row.sr_open_through,
        sr_gap_dir=row.sr_gap_dir,
        sr_method=row.sr_method,
    )


def filter_snapshot_rows(
    rows: Iterable[ResearchRow],
    spec,
    allowed_symbol_ids: Iterable[str],
) -> list[ResearchRow]:
    allowed = set(allowed_symbol_ids)
    return [row for row in rows if match_research_row(row, spec, allowed)]


class ResearchSnapshotCache:
    """Process-wide snapshot. Concurrent ensure() callers share one load."""

    def __init__(
        self,
        loader: Callable[[], ResearchSnapshot],
        *,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        enabled: bool = True,
        now_fn: Callable[[], datetime] | None = None,
        today_fn: Callable[[], date] | None = None,
    ) -> None:
        self._loader = loader
        self._ttl = max(60, int(ttl_seconds or DEFAULT_TTL_SECONDS))
        self.enabled = bool(enabled)
        self._now = now_fn or (lambda: datetime.now(timezone.utc))
        self._today = today_fn or today_ist
        self._lock = threading.RLock()
        self._cv = threading.Condition(self._lock)
        self._snapshot: ResearchSnapshot | None = None
        self._loading = False
        self._last_error: str | None = None
        self._failed_at: datetime | None = None
        self._fail_cooldown_s = 60

    def peek(self) -> ResearchSnapshot | None:
        return self._snapshot

    @property
    def last_error(self) -> str | None:
        return self._last_error

    def _in_fail_cooldown(self) -> bool:
        if not self._last_error or self._failed_at is None:
            return False
        failed = self._failed_at
        if failed.tzinfo is None:
            failed = failed.replace(tzinfo=timezone.utc)
        now = self._now()
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        return (now - failed).total_seconds() < self._fail_cooldown_s

    def stale(self) -> bool:
        snap = self._snapshot
        if snap is None:
            return True
        now = self._now()
        loaded = snap.loaded_at
        if loaded.tzinfo is None:
            loaded = loaded.replace(tzinfo=timezone.utc)
        if (now - loaded).total_seconds() >= self._ttl:
            return True
        # New IST calendar day → reload so default lookback stays aligned.
        if snap.loaded_ist_date() < self._today():
            return True
        return False

    def ensure(self, *, force: bool = False) -> ResearchSnapshot:
        """
        Return a warm snapshot, loading from the loader if missing/stale.

        If a refresh fails and an older snapshot exists, that snapshot is kept.
        """
        if not self.enabled:
            raise RuntimeError("Research snapshot cache is disabled")

        with self._lock:
            if (
                not force
                and self._snapshot is not None
                and not self.stale()
            ):
                return self._snapshot
            while self._loading:
                self._cv.wait(timeout=90)
                if not force and self._snapshot is not None and not self.stale():
                    return self._snapshot
                # Loader just finished (ok or fail). Do not start another load.
                if not force and self._snapshot is not None and not self._loading:
                    return self._snapshot
            if (
                not force
                and self._snapshot is not None
                and not self.stale()
            ):
                return self._snapshot
            if not force and self._in_fail_cooldown():
                if self._snapshot is not None:
                    return self._snapshot
                raise RuntimeError(self._last_error or "Research snapshot unavailable")
            self._loading = True

        try:
            snap = self._loader()
            if snap is None:
                raise RuntimeError("Research snapshot loader returned empty")
            with self._lock:
                self._snapshot = snap
                self._last_error = None
                self._failed_at = None
                logger.info(
                    "Research snapshot loaded rows=%s window=%s..%s",
                    snap.row_count,
                    snap.window_from,
                    snap.window_to,
                )
                return snap
        except Exception as exc:
            with self._lock:
                self._last_error = str(exc)[:300]
                self._failed_at = self._now()
                if self._snapshot is not None:
                    logger.warning(
                        "Research snapshot refresh failed; keeping previous "
                        "(%s rows): %s",
                        self._snapshot.row_count,
                        self._last_error,
                    )
                    return self._snapshot
            raise
        finally:
            with self._lock:
                self._loading = False
                self._cv.notify_all()

    def refresh_if_stale(self) -> ResearchSnapshot | None:
        """Background-safe refresh. Returns current snapshot (possibly stale)."""
        if not self.enabled:
            return self._snapshot
        if self._snapshot is not None and not self.stale():
            return self._snapshot
        try:
            return self.ensure()
        except Exception:
            logger.exception("Research snapshot refresh failed")
            return self._snapshot

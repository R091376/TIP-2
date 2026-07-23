"""End-to-end tests for PostgresPatternJournal using SQLite (schema via ORM)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.journal.entities import (
    PatternEventRow,
    PatternInstanceRow,
    PatternOutcomeRow,
    PatternStatisticsRow,
)
from app.journal.postgres_journal import PostgresPatternJournal
from app.patterns.models import (
    FinalOutcome,
    PatternDirection,
    PatternStage,
    PatternStageEvent,
    PatternType,
    new_pattern,
)
from app.patterns.startup import reconcile_patterns_on_startup
from app.patterns.active_store import ActiveInstanceStore
from app.config import Settings


@pytest.fixture()
def journal():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    # Import side-effect: register models on Base
    assert PatternInstanceRow.__tablename__
    Base.metadata.create_all(engine)
    sf = sessionmaker(bind=engine, expire_on_commit=False)
    return PostgresPatternJournal(sf), sf


def _pattern(**kwargs):
    now = datetime.now(timezone.utc)
    defaults = dict(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="NSE_EQ|TEST",
        timeframe="5m",
        direction=PatternDirection.LONG,
        reference_level=100.0,
        lookback_high=100.0,
        atr_at_detect=2.0,
        volume_at_detect=1000,
        entry_price=101.0,
        stop_level=100.0,
        target_level=105.0,
        detect_candle_time=1_700_000_000,
        detected_at=now,
        mfe_price=102.0,
        mae_price=100.5,
        detector_version="breakout-v1",
    )
    defaults.update(kwargs)
    return new_pattern(**defaults)


def test_persist_lifecycle_detect_and_success(journal):
    j, sf = journal
    p = _pattern()
    now = datetime.now(timezone.utc)
    det = PatternStageEvent(p.id, PatternStage.DETECTED, p.detect_candle_time, 101.0, now)
    j.persist_lifecycle(p, [det])

    open_list = j.find_open("NSE_EQ|TEST", "5m")
    assert len(open_list) == 1
    assert open_list[0].id == p.id
    assert open_list[0].status == PatternStage.DETECTED

    p.mfe_price = 106.0
    p.mae_price = 100.0
    p.duration_candles = 3
    p.mark_terminal(FinalOutcome.SUCCEEDED, PatternStage.SUCCEEDED, "price_target", 105.5)
    succ = PatternStageEvent(p.id, PatternStage.SUCCEEDED, p.detect_candle_time + 300, 105.5, now)
    j.apply_events(p, [succ])

    assert j.find_open("NSE_EQ|TEST", "5m") == []
    closed = j.find_recent("NSE_EQ|TEST", "closed", 10)
    assert len(closed) == 1
    assert closed[0].is_terminal()

    with sf() as s:
        outcome = s.get(PatternOutcomeRow, p.id)
        assert outcome is not None
        assert outcome.final_outcome == "succeeded"
        assert outcome.move_r is not None
        from sqlalchemy import select

        events = s.scalars(
            select(PatternEventRow).where(PatternEventRow.pattern_instance_id == p.id)
        ).all()
        types = {e.event_type for e in events}
        assert "detected" in types
        assert "succeeded" in types

    snap = j.find_statistics("NSE_EQ|TEST", "breakout", "5m")
    assert snap is not None
    assert snap.sample_size == 1
    assert snap.success_count == 1
    assert snap.success_rate == 1.0


def test_idempotent_event_insert(journal):
    j, _ = journal
    p = _pattern()
    now = datetime.now(timezone.utc)
    det = PatternStageEvent(p.id, PatternStage.DETECTED, 1, 101.0, now)
    j.persist_lifecycle(p, [det])
    j.persist_lifecycle(p, [det])  # second time: no duplicate event
    with j._sf() as s:
        from sqlalchemy import func, select

        n = s.scalar(
            select(func.count())
            .select_from(PatternEventRow)
            .where(
                PatternEventRow.pattern_instance_id == p.id,
                PatternEventRow.event_type == "detected",
            )
        )
        assert n == 1


def test_suppress_excursion_on_startup_recovery(journal):
    j, sf = journal
    p = _pattern(timeframe="5m")
    now = datetime.now(timezone.utc)
    j.persist_lifecycle(
        p,
        [PatternStageEvent(p.id, PatternStage.DETECTED, 1, 101.0, now)],
    )
    p.mark_terminal(FinalOutcome.EXPIRED, PatternStage.EXPIRED, "startup_recovery", None, True)
    j.apply_events(
        p, [PatternStageEvent(p.id, PatternStage.EXPIRED, 1, 101.0, now)]
    )
    with sf() as s:
        o = s.get(PatternOutcomeRow, p.id)
        assert o is not None
        assert o.max_favorable_r is None
        assert o.move_r is None


def test_find_open_by_timeframes(journal):
    j, _ = journal
    now = datetime.now(timezone.utc)
    p5 = _pattern(timeframe="5m")
    p1h = _pattern(timeframe="1h", symbol_id="NSE_EQ|Y")
    for p in (p5, p1h):
        j.persist_lifecycle(
            p,
            [PatternStageEvent(p.id, PatternStage.DETECTED, 1, 101.0, now)],
        )
    session_opens = j.find_open_by_timeframes({"1m", "5m", "15m"})
    assert any(x.id == p5.id for x in session_opens)
    assert not any(x.id == p1h.id for x in session_opens)
    multi = j.find_open_by_timeframes({"1h", "4h", "1d"})
    assert any(x.id == p1h.id for x in multi)


def test_bulk_statistics(journal):
    j, _ = journal
    now = datetime.now(timezone.utc)
    for i, outcome in enumerate(
        [FinalOutcome.SUCCEEDED, FinalOutcome.FAILED, FinalOutcome.SUCCEEDED]
    ):
        p = _pattern(symbol_id="NSE_EQ|Z")
        j.persist_lifecycle(
            p, [PatternStageEvent(p.id, PatternStage.DETECTED, i, 100.0, now)]
        )
        stage = {
            FinalOutcome.SUCCEEDED: PatternStage.SUCCEEDED,
            FinalOutcome.FAILED: PatternStage.FAILED,
            FinalOutcome.EXPIRED: PatternStage.EXPIRED,
        }[outcome]
        p.mark_terminal(outcome, stage, "test", 102.0)
        j.apply_events(p, [PatternStageEvent(p.id, stage, i + 1, 102.0, now)])

    snaps = j.find_statistics_for_symbols(["NSE_EQ|Z"], "breakout", "5m")
    assert len(snaps) == 1
    assert snaps[0].sample_size == 3
    assert snaps[0].success_count == 2
    assert snaps[0].fail_count == 1


class _FakeWatchlist:
    def __init__(self, ids: set[str]):
        self.ids = ids

    def contains_symbol_id(self, sid: str) -> bool:
        return sid in self.ids

    def find_by_symbol_id(self, sid: str):
        return object() if sid in self.ids else None


def test_startup_reconcile_purges_session_tf(journal):
    """Restart must delete session-TF instances + events, not leave expired noise."""
    j, sf = journal
    now = datetime.now(timezone.utc)
    p = _pattern(timeframe="5m", symbol_id="NSE_EQ|S")
    j.persist_lifecycle(
        p, [PatternStageEvent(p.id, PatternStage.DETECTED, 1, 101.0, now)]
    )
    store = ActiveInstanceStore()
    settings = Settings()
    reconcile_patterns_on_startup(
        settings, j, store, _FakeWatchlist({"NSE_EQ|S"})
    )
    assert j.find_open("NSE_EQ|S", "5m") == []
    assert j.find_recent("NSE_EQ|S", "closed", 5) == []
    with sf() as s:
        assert s.get(PatternInstanceRow, p.id) is None
        n_ev = s.scalars(
            select(PatternEventRow).where(PatternEventRow.pattern_instance_id == p.id)
        ).all()
        assert n_ev == []


def test_startup_purges_historical_startup_recovery(journal):
    j, sf = journal
    now = datetime.now(timezone.utc)
    p = _pattern(timeframe="5m", symbol_id="NSE_EQ|R")
    j.persist_lifecycle(
        p, [PatternStageEvent(p.id, PatternStage.DETECTED, 1, 101.0, now)]
    )
    p.mark_terminal(FinalOutcome.EXPIRED, PatternStage.EXPIRED, "startup_recovery", None, True)
    j.apply_events(
        p, [PatternStageEvent(p.id, PatternStage.EXPIRED, 1, 101.0, now)]
    )
    # max_candles expiry must survive cleanup
    p2 = _pattern(timeframe="5m", symbol_id="NSE_EQ|M")
    j.persist_lifecycle(
        p2, [PatternStageEvent(p2.id, PatternStage.DETECTED, 2, 101.0, now)]
    )
    p2.mark_terminal(FinalOutcome.EXPIRED, PatternStage.EXPIRED, "max_candles", 100.0)
    j.apply_events(
        p2, [PatternStageEvent(p2.id, PatternStage.EXPIRED, 3, 100.0, now)]
    )

    store = ActiveInstanceStore()
    reconcile_patterns_on_startup(
        Settings(), j, store, _FakeWatchlist({"NSE_EQ|R", "NSE_EQ|M"})
    )
    with sf() as s:
        assert s.get(PatternInstanceRow, p.id) is None
        assert s.get(PatternInstanceRow, p2.id) is not None
        o2 = s.get(PatternOutcomeRow, p2.id)
        assert o2 is not None and o2.reason == "max_candles"


def test_startup_hydrate_multi_day(journal):
    j, _ = journal
    now = datetime.now(timezone.utc)
    p = _pattern(timeframe="1h", symbol_id="NSE_EQ|H")
    j.persist_lifecycle(
        p, [PatternStageEvent(p.id, PatternStage.DETECTED, 1, 101.0, now)]
    )
    store = ActiveInstanceStore()
    settings = Settings()
    reconcile_patterns_on_startup(
        settings, j, store, _FakeWatchlist({"NSE_EQ|H"})
    )
    opens = store.get_open("NSE_EQ|H", "1h")
    assert len(opens) == 1
    assert opens[0].id == p.id

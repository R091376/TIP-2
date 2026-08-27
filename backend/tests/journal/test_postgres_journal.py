"""End-to-end tests for PostgresPatternJournal using SQLite (schema via ORM)."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.journal.entities import (
    DailySrLevelRow,
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
    assert DailySrLevelRow.__tablename__
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
    # entry 101, stop 100, target 105, atr 2 → planned RR 4, risk 0.5R, reward 2.0R
    assert snap.planned_rr_sample_size == 1
    assert snap.avg_planned_rr == 4.0
    assert snap.avg_risk_r == 0.5
    assert snap.avg_reward_r == 2.0
    assert snap.min_planned_rr == 4.0
    assert snap.max_planned_rr == 4.0
    assert snap.median_planned_rr == 4.0


def test_recompute_planned_rails_stats_backfill(journal):
    j, sf = journal
    now = datetime.now(timezone.utc)
    p = _pattern()
    j.persist_lifecycle(
        p, [PatternStageEvent(p.id, PatternStage.DETECTED, p.detect_candle_time, 101.0, now)]
    )
    p.mark_terminal(FinalOutcome.SUCCEEDED, PatternStage.SUCCEEDED, "price_target", 105.5)
    j.apply_events(
        p,
        [PatternStageEvent(p.id, PatternStage.SUCCEEDED, p.detect_candle_time + 300, 105.5, now)],
    )

    # Wipe planned fields as if migration just added zero columns
    with sf() as s:
        row = s.get(
            PatternStatisticsRow,
            {
                "symbol_id": "NSE_EQ|TEST",
                "pattern_type": "breakout",
                "timeframe": "5m",
            },
        )
        assert row is not None
        row.avg_planned_rr = 0.0
        row.avg_risk_r = 0.0
        row.avg_reward_r = 0.0
        row.planned_rr_sample_size = 0
        s.commit()

    result = j.recompute_planned_rails_stats()
    assert result["instances_included"] == 1
    assert result["buckets_updated"] == 1

    snap = j.find_statistics("NSE_EQ|TEST", "breakout", "5m")
    assert snap is not None
    assert snap.planned_rr_sample_size == 1
    assert snap.avg_planned_rr == 4.0
    assert snap.avg_risk_r == 0.5
    assert snap.avg_reward_r == 2.0
    assert snap.min_planned_rr == 4.0
    assert snap.max_planned_rr == 4.0
    assert snap.median_planned_rr == 4.0


def test_planned_rr_is_ratio_of_averages_not_mean_of_rrs(journal):
    """Tiny-risk outlier must not inflate Plan R:R via mean-of-ratios."""
    j, _ = journal
    now = datetime.now(timezone.utc)
    # Trade A: risk 0.1 pts, reward 2 pts, atr 1 → risk_r 0.1, reward_r 2, RR 20
    a = _pattern(
        symbol_id="NSE_EQ|RR",
        detect_candle_time=100,
        entry_price=100.0,
        stop_level=99.9,
        target_level=102.0,
        atr_at_detect=1.0,
    )
    # Trade B: risk 1, reward 1, atr 1 → risk_r 1, reward_r 1, RR 1
    b = _pattern(
        symbol_id="NSE_EQ|RR",
        detect_candle_time=200,
        entry_price=100.0,
        stop_level=99.0,
        target_level=101.0,
        atr_at_detect=1.0,
    )
    for p in (a, b):
        j.persist_lifecycle(
            p,
            [PatternStageEvent(p.id, PatternStage.DETECTED, p.detect_candle_time, 100.0, now)],
        )
        p.mark_terminal(FinalOutcome.SUCCEEDED, PatternStage.SUCCEEDED, "test", 101.0)
        j.apply_events(
            p,
            [
                PatternStageEvent(
                    p.id, PatternStage.SUCCEEDED, p.detect_candle_time + 1, 101.0, now
                )
            ],
        )

    snap = j.find_statistics("NSE_EQ|RR", "breakout", "5m")
    assert snap is not None
    assert snap.planned_rr_sample_size == 2
    assert abs(snap.avg_risk_r - 0.55) < 1e-9
    assert abs(snap.avg_reward_r - 1.5) < 1e-9
    # ratio of averages ≈ 2.727, not mean of RRs (10.5)
    assert abs(snap.avg_planned_rr - (1.5 / 0.55)) < 1e-9
    assert snap.avg_planned_rr < 3.0
    # Secondary: min / median / max of per-trade RRs {1, 20}
    assert abs(snap.min_planned_rr - 1.0) < 1e-9
    assert abs(snap.max_planned_rr - 20.0) < 1e-9
    assert abs(snap.median_planned_rr - 10.5) < 1e-9


def test_planned_rr_extremes_recover_from_zero_defaults(journal):
    """V9 DEFAULT 0 min/max must not poison extremes when npr>0 (review Issue 1)."""
    j, sf = journal
    now = datetime.now(timezone.utc)
    # First closed trade: RR = 4 (entry 101, stop 100, target 105, atr 2)
    p1 = _pattern(symbol_id="NSE_EQ|EX", detect_candle_time=100)
    j.persist_lifecycle(
        p1,
        [PatternStageEvent(p1.id, PatternStage.DETECTED, p1.detect_candle_time, 101.0, now)],
    )
    p1.mark_terminal(FinalOutcome.SUCCEEDED, PatternStage.SUCCEEDED, "test", 105.0)
    j.apply_events(
        p1,
        [
            PatternStageEvent(
                p1.id, PatternStage.SUCCEEDED, p1.detect_candle_time + 1, 105.0, now
            )
        ],
    )

    # Simulate post-migration state: sample size kept, extremes zeroed
    with sf() as s:
        row = s.get(
            PatternStatisticsRow,
            {
                "symbol_id": "NSE_EQ|EX",
                "pattern_type": "breakout",
                "timeframe": "5m",
            },
        )
        assert row is not None
        assert row.planned_rr_sample_size == 1
        row.min_planned_rr = 0.0
        row.max_planned_rr = 0.0
        row.median_planned_rr = 0.0
        s.commit()

    # Second trade: RR = 1 (entry 100, stop 99, target 101, atr 1)
    p2 = _pattern(
        symbol_id="NSE_EQ|EX",
        detect_candle_time=200,
        entry_price=100.0,
        stop_level=99.0,
        target_level=101.0,
        atr_at_detect=1.0,
    )
    j.persist_lifecycle(
        p2,
        [PatternStageEvent(p2.id, PatternStage.DETECTED, p2.detect_candle_time, 100.0, now)],
    )
    p2.mark_terminal(FinalOutcome.SUCCEEDED, PatternStage.SUCCEEDED, "test", 101.0)
    j.apply_events(
        p2,
        [
            PatternStageEvent(
                p2.id, PatternStage.SUCCEEDED, p2.detect_candle_time + 1, 101.0, now
            )
        ],
    )

    snap = j.find_statistics("NSE_EQ|EX", "breakout", "5m")
    assert snap is not None
    assert snap.planned_rr_sample_size == 2
    # Full history {4, 1} — not min(0, 1)=0 or max only from post-zero trades
    assert abs(snap.min_planned_rr - 1.0) < 1e-9
    assert abs(snap.max_planned_rr - 4.0) < 1e-9
    assert abs(snap.median_planned_rr - 2.5) < 1e-9


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
        # Distinct detect_candle_time so fingerprint does not collapse instances
        p = _pattern(symbol_id="NSE_EQ|Z", detect_candle_time=1_700_000_000 + i)
        j.persist_lifecycle(
            p,
            [
                PatternStageEvent(
                    p.id, PatternStage.DETECTED, p.detect_candle_time, 100.0, now
                )
            ],
        )
        stage = {
            FinalOutcome.SUCCEEDED: PatternStage.SUCCEEDED,
            FinalOutcome.FAILED: PatternStage.FAILED,
            FinalOutcome.EXPIRED: PatternStage.EXPIRED,
        }[outcome]
        p.mark_terminal(outcome, stage, "test", 102.0)
        j.apply_events(
            p, [PatternStageEvent(p.id, stage, p.detect_candle_time + 1, 102.0, now)]
        )

    snaps = j.find_statistics_for_symbols(["NSE_EQ|Z"], "breakout", "5m")
    assert len(snaps) == 1
    assert snaps[0].sample_size == 3
    assert snaps[0].success_count == 2
    assert snaps[0].fail_count == 1
    assert snaps[0].planned_rr_sample_size == 3
    # Same rails on each trade: ratio of averages equals per-trade RR
    assert snaps[0].avg_risk_r == 0.5
    assert snaps[0].avg_reward_r == 2.0
    assert snaps[0].avg_planned_rr == 4.0


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


def _close_pattern(j, **kwargs):
    now = datetime.now(timezone.utc)
    p = _pattern(**kwargs)
    j.persist_lifecycle(
        p,
        [PatternStageEvent(p.id, PatternStage.DETECTED, p.detect_candle_time, 101.0, now)],
    )
    p.mark_terminal(FinalOutcome.SUCCEEDED, PatternStage.SUCCEEDED, "price_target", 105.5)
    j.apply_events(
        p,
        [PatternStageEvent(p.id, PatternStage.SUCCEEDED, p.detect_candle_time + 300, 105.5, now)],
    )
    return p


def test_research_aggregate_uses_cache_across_filters(journal):
    from app.patterns.research_filters import parse_research_filters

    j, _ = journal
    t = int(datetime.now(timezone.utc).timestamp())
    _close_pattern(j, symbol_id="NSE_EQ|R", pattern_type=PatternType.BREAKOUT, detect_candle_time=t)
    _close_pattern(
        j,
        symbol_id="NSE_EQ|R",
        pattern_type=PatternType.BREAKDOWN,
        detect_candle_time=t + 60,
        direction=PatternDirection.SHORT,
        entry_price=99.0,
        stop_level=100.0,
        target_level=95.0,
    )

    fetches = {"n": 0}
    orig = j._fetch_closed_rows

    def wrapped(*args, **kwargs):
        fetches["n"] += 1
        return orig(*args, **kwargs)

    j._fetch_closed_rows = wrapped

    spec_all = parse_research_filters({"minSampleSize": "5"})
    spec_bo = parse_research_filters({"patternType": "breakout", "minSampleSize": "5"})
    all_resp = j.aggregate_filtered(spec_all, allowed_symbol_ids=["NSE_EQ|R"])
    bo_resp = j.aggregate_filtered(spec_bo, allowed_symbol_ids=["NSE_EQ|R"])

    assert fetches["n"] == 1
    assert all_resp["cache"]["hit"] is True
    assert bo_resp["cache"]["hit"] is True
    assert all_resp["totalMatched"] == 2
    assert bo_resp["totalMatched"] == 1


def test_research_aggregate_requires_cache(journal):
    from app.journal.postgres_journal import PostgresPatternJournal
    from app.patterns.research_filters import parse_research_filters

    _, sf = journal
    live = PostgresPatternJournal(sf, research_cache_enabled=False)
    spec = parse_research_filters({"minSampleSize": "5"})
    with pytest.raises(RuntimeError, match="snapshot cache is disabled"):
        live.aggregate_filtered(spec, allowed_symbol_ids=["NSE_EQ|L"])


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


def test_fill_sr_if_null_on_fingerprint_reuse(journal):
    j, sf = journal
    now = datetime.now(timezone.utc)
    first = _pattern()
    j.persist_lifecycle(
        first,
        [PatternStageEvent(first.id, PatternStage.DETECTED, first.detect_candle_time, 101.0, now)],
    )
    with sf() as s:
        row = s.get(PatternInstanceRow, first.id)
        assert row is not None
        assert row.sr_method is None

    stamped = _pattern()
    stamped.sr_method = "woodie_open_v1"
    stamped.sr_session_date = date(2026, 8, 18)
    stamped.sr_nearest = "s2"
    stamped.sr_near = True
    stamped.sr_distance_atr = 0.2
    stamped.sr_cross = "none"
    stamped.sr_confluence = True
    stamped.sr_break = False
    stamped.sr_open_through = ""
    stamped.sr_gap_dir = "flat"
    stamped.sr_ladder_json = {"pp": 100.0, "s2": 98.0}
    j.persist_lifecycle(
        stamped,
        [
            PatternStageEvent(
                stamped.id, PatternStage.DETECTED, stamped.detect_candle_time, 101.0, now
            )
        ],
    )
    with sf() as s:
        row = s.get(PatternInstanceRow, first.id)
        assert row is not None
        assert row.sr_method == "woodie_open_v1"
        assert row.sr_nearest == "s2"

    stamped.sr_nearest = "r1"
    j.persist_lifecycle(
        stamped,
        [
            PatternStageEvent(
                stamped.id, PatternStage.CONFIRMED, stamped.detect_candle_time, 101.0, now
            )
        ],
    )
    with sf() as s:
        row = s.get(PatternInstanceRow, first.id)
        assert row is not None
        assert row.sr_nearest == "s2"


def test_geometry_round_trip_and_fill_if_null(journal):
    j, sf = journal
    now = datetime.now(timezone.utc)
    geo = {
        "kind": "double_bottom",
        "version": 1,
        "pivots": [{"role": "trough1", "index": 12, "time": 1, "price": 100.0, "high": False}],
        "patternHeight": 8.0,
    }
    first = _pattern(pattern_type=PatternType.DOUBLE_BOTTOM, geometry=geo)
    j.persist_lifecycle(
        first,
        [PatternStageEvent(first.id, PatternStage.DETECTED, first.detect_candle_time, 101.0, now)],
    )
    open_list = j.find_open("NSE_EQ|TEST", "5m")
    assert len(open_list) == 1
    assert open_list[0].geometry == geo
    assert open_list[0].to_dto()["geometry"]["kind"] == "double_bottom"

    blank = _pattern(pattern_type=PatternType.DOUBLE_BOTTOM, geometry=None)
    j.persist_lifecycle(
        blank,
        [PatternStageEvent(blank.id, PatternStage.DETECTED, blank.detect_candle_time, 101.0, now)],
    )
    with sf() as s:
        row = s.get(PatternInstanceRow, first.id)
        assert row is not None
        assert row.geometry_json == geo

    later = _pattern(
        pattern_type=PatternType.DOUBLE_BOTTOM,
        geometry={"kind": "double_bottom", "version": 2},
    )
    j.persist_lifecycle(
        later,
        [
            PatternStageEvent(
                later.id, PatternStage.CONFIRMED, later.detect_candle_time, 101.0, now
            )
        ],
    )
    with sf() as s:
        row = s.get(PatternInstanceRow, first.id)
        assert row is not None
        assert row.geometry_json == geo


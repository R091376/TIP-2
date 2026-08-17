"""Daily research snapshot cache: one load, many in-memory filter passes."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

from app.patterns.research_cache import (
    ResearchSnapshot,
    ResearchSnapshotCache,
    filter_snapshot_rows,
)
from app.patterns.research_filters import parse_research_filters
from app.patterns.research_metrics import ResearchRow


def _row(**kwargs) -> ResearchRow:
    now = int(datetime(2026, 8, 17, 10, 0, tzinfo=timezone.utc).timestamp())
    defaults = dict(
        symbol_id="NSE_EQ|A",
        pattern_type="breakout",
        timeframe="5m",
        direction="long",
        status="succeeded",
        flag_confirmed=True,
        flag_retested=True,
        flag_strengthened=False,
        volume_ok_at_detect=True,
        confirmation_mode_used="both",
        detector_version="breakout-v1",
        detect_candle_time=now,
        entry_price=101.0,
        stop_level=100.0,
        target_level=105.0,
        atr_at_detect=2.0,
        final_outcome="succeeded",
        reason="price_target",
        duration_candles=3,
        max_favorable_r=2.0,
        max_adverse_r=0.2,
        move_r=2.0,
    )
    defaults.update(kwargs)
    return ResearchRow(**defaults)


def _snap(loaded_at: datetime, rows=()) -> ResearchSnapshot:
    return ResearchSnapshot(
        rows=tuple(rows),
        loaded_at=loaded_at,
        window_from=date(2026, 2, 19),
        window_to=date(2026, 8, 17),
    )


def test_ensure_loads_once_for_same_day():
    now = {"t": datetime(2026, 8, 17, 10, 0, tzinfo=timezone.utc)}
    today = {"d": date(2026, 8, 17)}
    loads = {"n": 0}

    def loader():
        loads["n"] += 1
        return _snap(now["t"], [_row()])

    cache = ResearchSnapshotCache(
        loader,
        ttl_seconds=86_400,
        now_fn=lambda: now["t"],
        today_fn=lambda: today["d"],
    )
    a = cache.ensure()
    b = cache.ensure()
    assert loads["n"] == 1
    assert a is b
    assert a.row_count == 1


def test_new_ist_day_refreshes_snapshot():
    now = {"t": datetime(2026, 8, 17, 10, 0, tzinfo=timezone.utc)}
    today = {"d": date(2026, 8, 17)}
    loads = {"n": 0}

    def loader():
        loads["n"] += 1
        return _snap(now["t"])

    cache = ResearchSnapshotCache(
        loader,
        ttl_seconds=86_400,
        now_fn=lambda: now["t"],
        today_fn=lambda: today["d"],
    )
    cache.ensure()
    today["d"] = date(2026, 8, 18)
    now["t"] = datetime(2026, 8, 17, 19, 30, tzinfo=timezone.utc)
    cache.ensure()
    assert loads["n"] == 2


def test_ttl_expiry_refreshes_even_same_calendar_day():
    now = {"t": datetime(2026, 8, 17, 10, 0, tzinfo=timezone.utc)}
    today = {"d": date(2026, 8, 17)}
    loads = {"n": 0}

    def loader():
        loads["n"] += 1
        return _snap(now["t"])

    cache = ResearchSnapshotCache(
        loader,
        ttl_seconds=86_400,
        now_fn=lambda: now["t"],
        today_fn=lambda: today["d"],
    )
    cache.ensure()
    now["t"] = now["t"] + timedelta(seconds=86_401)
    cache.ensure()
    assert loads["n"] == 2


def test_failed_refresh_keeps_previous_snapshot():
    now = {"t": datetime(2026, 8, 17, 10, 0, tzinfo=timezone.utc)}
    today = {"d": date(2026, 8, 17)}
    loads = {"n": 0}

    def loader():
        loads["n"] += 1
        if loads["n"] >= 2:
            raise RuntimeError("db down")
        return _snap(now["t"], [_row()])

    cache = ResearchSnapshotCache(
        loader,
        ttl_seconds=86_400,
        now_fn=lambda: now["t"],
        today_fn=lambda: today["d"],
    )
    first = cache.ensure()
    today["d"] = date(2026, 8, 18)
    kept = cache.ensure()
    assert kept is first
    assert kept.row_count == 1
    assert cache.last_error and "db down" in cache.last_error
    # Stale + recent fail must not reload on every subsequent query.
    kept2 = cache.ensure()
    assert kept2 is first
    assert loads["n"] == 2
    now["t"] = now["t"] + timedelta(seconds=61)
    kept3 = cache.ensure()
    assert kept3 is first
    assert loads["n"] == 3


def test_first_load_failure_raises():
    def loader():
        raise RuntimeError("empty db")

    cache = ResearchSnapshotCache(loader, ttl_seconds=86_400)
    with pytest.raises(RuntimeError, match="empty db"):
        cache.ensure()


def test_first_load_failure_cools_down_before_retry():
    now = {"t": datetime(2026, 8, 17, 10, 0, tzinfo=timezone.utc)}
    loads = {"n": 0}

    def loader():
        loads["n"] += 1
        raise RuntimeError("empty db")

    cache = ResearchSnapshotCache(
        loader, ttl_seconds=86_400, now_fn=lambda: now["t"], today_fn=lambda: date(2026, 8, 17)
    )
    with pytest.raises(RuntimeError, match="empty db"):
        cache.ensure()
    with pytest.raises(RuntimeError, match="empty db"):
        cache.ensure()
    assert loads["n"] == 1
    now["t"] = now["t"] + timedelta(seconds=61)
    with pytest.raises(RuntimeError, match="empty db"):
        cache.ensure()
    assert loads["n"] == 2


def test_disabled_cache_refuses_ensure():
    cache = ResearchSnapshotCache(lambda: _snap(datetime.now(timezone.utc)), enabled=False)
    with pytest.raises(RuntimeError, match="disabled"):
        cache.ensure()


def test_filter_snapshot_rows_applies_type_and_flag():
    rows = [
        _row(pattern_type="breakout", flag_retested=True, symbol_id="NSE_EQ|A"),
        _row(pattern_type="breakdown", flag_retested=False, symbol_id="NSE_EQ|A"),
        _row(pattern_type="breakout", flag_retested=True, symbol_id="NSE_EQ|B"),
    ]
    spec = parse_research_filters(
        {
            "patternType": "breakout",
            "flagRetested": "true",
            "detectedFrom": "2026-08-01",
            "detectedTo": "2026-08-17",
        }
    )
    matched = filter_snapshot_rows(rows, spec, ["NSE_EQ|A", "NSE_EQ|B"])
    assert {r.symbol_id for r in matched} == {"NSE_EQ|A", "NSE_EQ|B"}
    assert all(r.pattern_type == "breakout" for r in matched)

    watchlist_only = filter_snapshot_rows(rows, spec, ["NSE_EQ|A"])
    assert [r.symbol_id for r in watchlist_only] == ["NSE_EQ|A"]

"""Unit tests for research filter parse / match / metrics."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.patterns.research_filters import (
    ResearchFilterError,
    detect_candle_ist,
    parse_group_by,
    parse_research_filters,
    row_matches_filters,
    today_ist,
)
from app.patterns.research_metrics import (
    ResearchRow,
    aggregate_research,
    empty_research_response,
)

IST = ZoneInfo("Asia/Kolkata")


def test_parse_group_by_exact_enum():
    assert parse_group_by(None) == "symbol,patternType,timeframe"
    assert parse_group_by("patternType,timeframe") == "patternType,timeframe"
    assert parse_group_by("none") == "none"
    with pytest.raises(ResearchFilterError):
        parse_group_by("symbol")
    with pytest.raises(ResearchFilterError):
        parse_group_by("patternType,timeframe,extra")


def test_parse_defaults_180d_lookback():
    spec = parse_research_filters({}, default_lookback_days=180, max_range_days=180)
    assert spec.detected_from is not None
    assert spec.detected_to is not None
    assert spec.date_defaulted is True
    span = (spec.detected_to - spec.detected_from).days + 1
    assert span == 180
    assert spec.detected_to == today_ist()


def test_parse_tod_pair_required():
    with pytest.raises(ResearchFilterError):
        parse_research_filters({"detectTimeIstStart": "09:30"})
    with pytest.raises(ResearchFilterError):
        parse_research_filters({"detectTimeIstEnd": "15:00"})
    spec = parse_research_filters(
        {"detectTimeIstStart": "09:30", "detectTimeIstEnd": "15:00"}
    )
    assert spec.detect_time_ist_start == time(9, 30)
    assert spec.detect_time_ist_end == time(15, 0)


def test_parse_future_date_rejected():
    future = (today_ist() + timedelta(days=2)).isoformat()
    with pytest.raises(ResearchFilterError):
        parse_research_filters({"detectedFrom": future, "detectedTo": future})


def test_parse_range_exceeds_max():
    to = today_ist()
    frm = to - timedelta(days=200)
    with pytest.raises(ResearchFilterError):
        parse_research_filters(
            {"detectedFrom": frm.isoformat(), "detectedTo": to.isoformat()},
            max_range_days=180,
        )


def test_parse_clamps_from_to_max_lookback_start():
    from app.patterns.research_filters import lookback_start

    today = today_ist()
    earliest = lookback_start(today, max_range_days=180)
    # Legal 180-day span that starts before the trailing window.
    to = today - timedelta(days=30)
    frm = to - timedelta(days=179)
    spec = parse_research_filters(
        {"detectedFrom": frm.isoformat(), "detectedTo": to.isoformat()},
        max_range_days=180,
    )
    assert spec.detected_from == earliest
    assert spec.detected_to == to


def test_parse_rejects_range_entirely_before_lookback():
    today = today_ist()
    to = today - timedelta(days=200)
    frm = to - timedelta(days=30)
    with pytest.raises(ResearchFilterError, match="cannot be before"):
        parse_research_filters(
            {"detectedFrom": frm.isoformat(), "detectedTo": to.isoformat()},
            max_range_days=180,
        )


def test_min_sample_size_clamp():
    spec = parse_research_filters({"minSampleSize": "1"}, default_min_sample_size=20)
    assert spec.min_sample_size == 5
    spec2 = parse_research_filters({"minSampleSize": "999"}, default_min_sample_size=20)
    assert spec2.min_sample_size == 500


def test_resolved_only_forces_outcomes():
    spec = parse_research_filters({"resolvedOnly": "true"})
    assert spec.resolved_only is True
    assert set(spec.outcomes or []) == {"succeeded", "failed"}


def test_parse_min_max_risk_r():
    spec = parse_research_filters({"minRiskR": "0.5", "maxRiskR": "2.0"})
    assert spec.min_risk_r == 0.5
    assert spec.max_risk_r == 2.0
    # Rails thresholds imply require_valid_rails
    assert spec.require_valid_rails is True
    assert "minRiskR" in spec.echo_filters()
    assert "maxRiskR" in spec.echo_filters()

    with pytest.raises(ResearchFilterError):
        parse_research_filters({"minRiskR": "2", "maxRiskR": "1"})
    with pytest.raises(ResearchFilterError):
        parse_research_filters({"minRiskR": "-0.1"})
    with pytest.raises(ResearchFilterError):
        parse_research_filters({"maxRiskR": "nope"})
    with pytest.raises(ResearchFilterError):
        parse_research_filters({"minRiskR": "inf"})
    with pytest.raises(ResearchFilterError):
        parse_research_filters({"minPlannedRr": "Infinity"})
    with pytest.raises(ResearchFilterError):
        parse_research_filters({"maxRiskR": "nan"})


def test_row_matches_risk_r_bounds():
    today = today_ist().isoformat()
    spec = parse_research_filters(
        {
            "detectedFrom": today,
            "detectedTo": today,
            "minRiskR": "1.0",
            "maxRiskR": "2.0",
        },
        max_range_days=180,
    )
    dt = datetime.combine(today_ist(), time(10, 0), tzinfo=IST)
    epoch = int(dt.timestamp())
    base = dict(
        symbol_id="S1",
        pattern_type="breakout",
        timeframe="5m",
        direction="long",
        status="succeeded",
        flag_confirmed=True,
        flag_retested=False,
        flag_strengthened=False,
        volume_ok_at_detect=False,
        confirmation_mode_used="both",
        detector_version="breakout-v1",
        detect_candle_time=epoch,
        final_outcome="succeeded",
        reason=None,
        planned_rr=1.5,
        rails_valid=True,
        spec=spec,
        allowed_symbol_ids={"S1"},
    )
    assert row_matches_filters(**base, risk_r=1.0) is True
    assert row_matches_filters(**base, risk_r=2.0) is True
    assert row_matches_filters(**base, risk_r=0.99) is False
    assert row_matches_filters(**base, risk_r=2.01) is False
    assert row_matches_filters(**base, risk_r=None) is False
    # Invalid rails excluded when minRiskR set (require_valid_rails)
    assert (
        row_matches_filters(**{**base, "rails_valid": False}, risk_r=1.5) is False
    )


def test_detect_candle_ist_and_tod_match():
    # 2026-08-06 10:00 IST
    dt = datetime(2026, 8, 6, 10, 0, tzinfo=IST)
    epoch = int(dt.timestamp())
    ist = detect_candle_ist(epoch)
    assert ist is not None
    assert ist.hour == 10

    spec = parse_research_filters(
        {
            "detectedFrom": "2026-08-06",
            "detectedTo": "2026-08-06",
            "detectTimeIstStart": "09:30",
            "detectTimeIstEnd": "15:00",
            "flagRetested": "true",
            "volumeOkAtDetect": "true",
        },
        max_range_days=180,
    )
    ok = row_matches_filters(
        symbol_id="S1",
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
        detect_candle_time=epoch,
        final_outcome="succeeded",
        reason=None,
        planned_rr=2.0,
        rails_valid=True,
        spec=spec,
        allowed_symbol_ids={"S1"},
    )
    assert ok is True

    # 1d excluded when TOD set
    bad_1d = row_matches_filters(
        symbol_id="S1",
        pattern_type="breakout",
        timeframe="1d",
        direction="long",
        status="succeeded",
        flag_confirmed=True,
        flag_retested=True,
        flag_strengthened=False,
        volume_ok_at_detect=True,
        confirmation_mode_used="both",
        detector_version="breakout-v1",
        detect_candle_time=epoch,
        final_outcome="succeeded",
        reason=None,
        planned_rr=2.0,
        rails_valid=True,
        spec=spec,
        allowed_symbol_ids={"S1"},
    )
    assert bad_1d is False


def _row(**kwargs) -> ResearchRow:
    base = dict(
        symbol_id="S1",
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
        detect_candle_time=0,
        entry_price=100.0,
        stop_level=99.0,
        target_level=102.0,
        atr_at_detect=1.0,
        final_outcome="succeeded",
        reason=None,
        duration_candles=5,
        max_favorable_r=2.0,
        max_adverse_r=0.5,
        move_r=2.0,
    )
    base.update(kwargs)
    return ResearchRow(**base)


def test_aggregate_expectancy_and_ready_gate():
    spec = parse_research_filters(
        {
            "minSampleSize": "5",
            "detectedFrom": today_ist().isoformat(),
            "detectedTo": today_ist().isoformat(),
        },
        max_range_days=180,
    )
    # 3 wins, 2 fails — not ready for min 5? sample=5 ready
    rows = [
        _row(final_outcome="succeeded", move_r=2.0, status="succeeded"),
        _row(final_outcome="succeeded", move_r=1.0, status="succeeded"),
        _row(final_outcome="succeeded", move_r=3.0, status="succeeded"),
        _row(final_outcome="failed", move_r=-1.0, status="failed"),
        _row(final_outcome="failed", move_r=-1.0, status="failed"),
    ]
    body = aggregate_research(rows, spec)
    assert body["totalMatched"] == 5
    assert body["summary"]["ready"] is True
    assert body["summary"]["successCount"] == 3
    assert body["summary"]["failCount"] == 2
    # expectancy = mean move = (2+1+3-1-1)/5 = 0.8 (ATR units)
    assert body["summary"]["expectancyR"] == pytest.approx(0.8)
    item = body["items"][0]
    assert item["expectancyR"] == pytest.approx(0.8)
    assert item["avgWinMoveR"] == pytest.approx(2.0)
    assert item["avgLossMoveR"] == pytest.approx(-1.0)
    # True stop-R: risk_r = |100-99|/1 = 1 → true_r == move_r for these rows
    assert body["summary"]["expectancyTrueR"] == pytest.approx(0.8)
    assert item["expectancyTrueR"] == pytest.approx(0.8)
    assert item["trueRrSampleSize"] == 5


def test_expectancy_true_r_divides_by_stop_distance():
    """true R = move_r / risk_r; wide stop shrinks true R vs ATR move."""
    spec = parse_research_filters(
        {
            "minSampleSize": "5",
            "detectedFrom": today_ist().isoformat(),
            "detectedTo": today_ist().isoformat(),
        },
        max_range_days=180,
    )
    # entry=100, stop=98, atr=1 → risk_r=2; move_r=1 → true_r=0.5 each
    rows = [
        _row(
            final_outcome="succeeded",
            status="succeeded",
            entry_price=100.0,
            stop_level=98.0,
            target_level=103.0,
            atr_at_detect=1.0,
            move_r=1.0,
        )
        for _ in range(5)
    ]
    body = aggregate_research(rows, spec)
    assert body["summary"]["expectancyR"] == pytest.approx(1.0)
    assert body["summary"]["expectancyTrueR"] == pytest.approx(0.5)


def test_startup_recovery_skipped_from_path_and_rails():
    # minSampleSize clamps to >=5 — seed 5 rows so rates unlock
    spec = parse_research_filters(
        {
            "minSampleSize": "5",
            "detectedFrom": today_ist().isoformat(),
            "detectedTo": today_ist().isoformat(),
        },
        max_range_days=180,
    )
    rows = [
        _row(
            final_outcome="expired",
            status="expired",
            reason="startup_recovery",
            move_r=5.0,
            max_favorable_r=5.0,
            max_adverse_r=1.0,
        ),
        _row(final_outcome="succeeded", status="succeeded", move_r=1.0),
        _row(final_outcome="succeeded", status="succeeded", move_r=1.0),
        _row(final_outcome="succeeded", status="succeeded", move_r=1.0),
        _row(final_outcome="succeeded", status="succeeded", move_r=1.0),
    ]
    body = aggregate_research(rows, spec)
    # recovery counts in sample
    assert body["summary"]["sampleSize"] == 5
    assert body["summary"]["expiredCount"] == 1
    # move average only from non-recovery rows (4 × 1.0)
    item = body["items"][0]
    assert item["moveSampleSize"] == 4
    assert item["avgMoveR"] == pytest.approx(1.0)


def test_empty_research_response():
    spec = parse_research_filters({})
    body = empty_research_response(spec)
    assert body["totalMatched"] == 0
    assert body["count"] == 0
    assert body["summary"]["ready"] is False

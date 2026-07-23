"""Pattern day alerts API shape."""


def test_pattern_alerts_endpoint_shape(client):
    r = client.get("/api/pattern-alerts")
    assert r.status_code == 200
    body = r.json()
    assert "day" in body
    assert "count" in body
    assert "items" in body
    assert body.get("includeExpired") is True
    assert isinstance(body["items"], list)
    assert body["count"] == len(body["items"])


def test_pattern_alerts_accepts_day_param(client):
    r = client.get("/api/pattern-alerts", params={"day": "2026-07-22", "limit": 10})
    assert r.status_code == 200
    assert r.json()["day"] == "2026-07-22"


def test_pattern_alerts_bad_day(client):
    r = client.get("/api/pattern-alerts", params={"day": "not-a-date"})
    assert r.status_code == 400


def test_memory_journal_excludes_expired_by_default():
    from datetime import datetime, timezone
    from uuid import uuid4

    from app.patterns.journal import InMemoryPatternJournal
    from app.patterns.models import (
        PatternDirection,
        PatternStage,
        PatternStageEvent,
        PatternType,
        new_pattern,
    )

    j = InMemoryPatternJournal()
    now = datetime.now(timezone.utc)
    p = new_pattern(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        direction=PatternDirection.LONG,
        reference_level=100,
        lookback_high=100,
        atr_at_detect=1,
        entry_price=101,
        stop_level=100,
        target_level=105,
        detect_candle_time=int(now.timestamp()),
        mfe_price=101,
        mae_price=100,
    )
    j.insert_detected(
        p,
        PatternStageEvent(p.id, PatternStage.DETECTED, p.detect_candle_time, 101.0, now),
    )
    j.apply_events(
        p,
        [
            PatternStageEvent(
                p.id, PatternStage.EXPIRED, p.detect_candle_time + 300, 100.0, now
            )
        ],
    )
    items = j.list_session_day_alerts(limit=50, include_expired=False)
    assert all(a["stage"] != "expired" for a in items)
    assert any(a["stage"] == "detected" for a in items)
    with_exp = j.list_session_day_alerts(limit=50, include_expired=True)
    assert any(a["stage"] == "expired" for a in with_exp)


def test_memory_journal_matches_event_time_when_candle_time_off_day():
    """Refresh must still find alerts if event fired today but candle_time is odd."""
    from datetime import datetime, timedelta, timezone
    from zoneinfo import ZoneInfo

    from app.patterns.journal import InMemoryPatternJournal
    from app.patterns.models import (
        PatternDirection,
        PatternStage,
        PatternStageEvent,
        PatternType,
        new_pattern,
    )

    ist = ZoneInfo("Asia/Kolkata")
    now = datetime.now(tz=ist)
    # Candle time far in the past (seconds) — would miss pure candle filter
    old_ct = int((now - timedelta(days=30)).timestamp())
    j = InMemoryPatternJournal()
    p = new_pattern(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="NSE_EQ|Y",
        timeframe="5m",
        direction=PatternDirection.LONG,
        reference_level=100,
        lookback_high=100,
        atr_at_detect=1,
        entry_price=101,
        stop_level=100,
        target_level=105,
        detect_candle_time=old_ct,
        mfe_price=101,
        mae_price=100,
    )
    j.insert_detected(
        p,
        PatternStageEvent(p.id, PatternStage.DETECTED, old_ct, 101.0, now),
    )
    items = j.list_session_day_alerts(limit=50, include_expired=True)
    assert any(a["stage"] == "detected" and a["symbolId"] == "NSE_EQ|Y" for a in items)


def test_as_epoch_seconds_ms():
    from app.journal.postgres_journal import _as_epoch_seconds

    assert _as_epoch_seconds(1_700_000_000) == 1_700_000_000
    assert _as_epoch_seconds(1_700_000_000_000) == 1_700_000_000

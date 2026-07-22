from datetime import datetime, timezone

from app.patterns.journal import InMemoryPatternJournal
from app.patterns.models import (
    FinalOutcome,
    PatternDirection,
    PatternStage,
    PatternStageEvent,
    PatternType,
    new_pattern,
)


def test_persist_and_stats():
    j = InMemoryPatternJournal()
    now = datetime.now(timezone.utc)
    p = new_pattern(
        pattern_type=PatternType.BREAKOUT,
        symbol_id="S",
        timeframe="5m",
        direction=PatternDirection.LONG,
        reference_level=100,
        lookback_high=100,
        atr_at_detect=2,
        entry_price=101,
        stop_level=100,
        target_level=105,
        detect_candle_time=1,
        mfe_price=103,
        mae_price=100,
    )
    det = PatternStageEvent(p.id, PatternStage.DETECTED, 1, 101, now)
    j.persist_lifecycle(p, [det])
    p.mark_terminal(FinalOutcome.SUCCEEDED, PatternStage.SUCCEEDED, "price_target", 105)
    succ = PatternStageEvent(p.id, PatternStage.SUCCEEDED, 2, 105, now)
    j.apply_events(p, [succ])

    snap = j.find_statistics("S", "breakout", "5m")
    assert snap is not None
    assert snap.sample_size == 1
    assert snap.success_count == 1

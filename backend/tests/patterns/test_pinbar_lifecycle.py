"""PinBar lifecycle edge cases (Java PinBarLifecycleTest)."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.market.models import Candle
from app.patterns.models import (
    ConfirmationMode,
    FinalOutcome,
    PatternDirection,
    PatternStage,
    PatternType,
    ActivePattern,
)
from app.patterns.short_trade import on_candle_short_trade


NOW = datetime(2026, 7, 15, 10, 0, tzinfo=timezone.utc)


def _hammer(signal_high: float, entry: float, stop: float, atr: float) -> ActivePattern:
    target = entry + 1.5 * atr
    return ActivePattern(
        id=uuid4(),
        pattern_type=PatternType.HAMMER,
        symbol_id="NSE_EQ|X",
        timeframe="5m",
        direction=PatternDirection.LONG,
        status=PatternStage.DETECTED,
        confirmation_mode_used=ConfirmationMode.CLOSE,
        reference_level=stop,
        lookback_high=signal_high,
        atr_at_detect=atr,
        entry_price=entry,
        stop_level=stop,
        target_level=target,
        detect_candle_time=1_000,
        detected_at=NOW,
        mfe_price=signal_high,
        mae_price=stop,
        duration_candles=1,
        detector_version="pinbar-v1",
    )


def _confirm_long(signal_high: float):
    return lambda c: c.close > signal_high


def test_hammer_fails_on_close_below_stop():
    p = _hammer(100, 98, 95, 2.0)
    bad = Candle(2_000, 99, 99.5, 94, 94.5, 100)
    on_candle_short_trade(p, bad, NOW, 20, "timeout", _confirm_long(100))
    assert p.is_terminal()
    assert p.final_outcome == FinalOutcome.FAILED


def test_hammer_confirms_above_signal_high():
    p = _hammer(100, 98, 95, 2.0)
    hold = Candle(2_000, 100, 100.8, 99.5, 100.5, 100)
    events = on_candle_short_trade(p, hold, NOW, 20, "timeout", _confirm_long(100))
    assert p.flag_confirmed
    assert p.status == PatternStage.CONFIRMED
    assert len(events) >= 1


def test_hammer_succeeds_at_target():
    p = _hammer(100, 98, 95, 2.0)
    # target = 98 + 1.5*2 = 101
    win = Candle(2_000, 100, 102, 99, 101.5, 100)
    on_candle_short_trade(p, win, NOW, 20, "timeout", _confirm_long(100))
    assert p.is_terminal()
    assert p.final_outcome == FinalOutcome.SUCCEEDED
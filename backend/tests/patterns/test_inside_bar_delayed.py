"""Inside bar delayed break (Java InsideBarDelayedBreakTest)."""

from __future__ import annotations

from datetime import datetime, timezone

from app.market.models import Candle
from app.patterns.inside_bar import detect_inside_bar
from app.patterns.models import PatternDirection


def _base_series() -> list[Candle]:
    candles: list[Candle] = []
    t = 1_000_000
    px = 100.0
    for _ in range(20):
        candles.append(Candle(t, px, px + 0.5, px - 0.5, px + 0.1, 500))
        px += 0.2
        t += 300
    return candles


def test_detects_break_two_bars_after_inside():
    series = _base_series()
    t = series[-1].time + 300
    series.append(Candle(t, 100, 110, 95, 102, 1000))  # mother
    series.append(Candle(t + 300, 101, 108, 97, 103, 800))  # inside
    series.append(Candle(t + 600, 103, 107, 102, 104, 700))  # still inside mother
    series.append(Candle(t + 900, 104, 112, 103, 111, 1200))  # break

    cfg = {
        "min_mother_range_atr_mult": 0.5,
        "success_atr_mult": 1.5,
        "max_candles_after_detect": 20,
        "max_bars_after_inside": 5,
        "atr_period": 14,
        "detector_version": "inside-bar-v1",
    }
    p = detect_inside_bar(
        "NSE_EQ|X", "5m", series, False, cfg, datetime.now(timezone.utc)
    )
    assert p is not None
    assert p.direction == PatternDirection.LONG

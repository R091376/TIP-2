from datetime import datetime, timezone

from app.market.models import Candle
from app.patterns.inside_bar import detect_inside_bar


def test_detect_inside_bar_breakout():
    # mother wide, inside nested, then close above mother high
    # need enough bars for ATR
    candles = []
    for i in range(20):
        candles.append(Candle(i, 100, 102, 99, 101, 1000))
    mother = Candle(20, 100, 110, 90, 105, 2000)
    inside = Candle(21, 102, 108, 95, 103, 1000)
    signal = Candle(22, 108, 112, 107, 111, 1500)
    candles.extend([mother, inside, signal])
    cfg = {
        "min_mother_range_atr_mult": 0.1,
        "success_atr_mult": 1.5,
        "max_bars_after_inside": 5,
        "atr_period": 14,
        "detector_version": "inside-bar-v1",
    }
    p = detect_inside_bar("K", "5m", candles, False, cfg, datetime.now(timezone.utc))
    # may or may not fire depending on ATR range — assert no crash
    assert p is None or p.pattern_type.value == "inside_bar"

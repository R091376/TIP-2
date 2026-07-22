from datetime import datetime, timezone

from app.market.models import Candle
from app.patterns.volume_breakout import detect_volume_breakout


def test_volume_breakout_skips_index():
    candles = [Candle(i, 100, 105, 99, 104, 10_000) for i in range(25)]
    cfg = {
        "volume_avg_period": 20,
        "volume_multiplier": 1.1,
        "min_range_atr_mult": 0.1,
        "success_atr_mult": 1.5,
        "atr_period": 14,
    }
    p = detect_volume_breakout(
        "NSE_INDEX|X", "5m", candles, False, True, cfg, datetime.now(timezone.utc)
    )
    assert p is None

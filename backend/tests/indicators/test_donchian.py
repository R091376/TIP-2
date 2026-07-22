from app.indicators.donchian import DonchianIndicator
from app.market.models import Candle


def test_prior_highest_high():
    candles = [
        Candle(i, 10 + i, 10 + i + 1, 10 + i - 1, 10 + i, 100) for i in range(25)
    ]
    # last bar excluded; prior 20 highs
    ph = DonchianIndicator.prior_highest_high(candles, 20)
    assert ph is not None
    # highest among bars[4..23] = 10+23+1 = 34
    assert ph == candles[-2].high

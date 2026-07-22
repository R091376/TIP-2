from app.market.models import Candle
from app.patterns.engulfing import is_bearish_engulfing, is_bullish_engulfing


def test_bullish_engulfing():
    prior = Candle(1, 105, 106, 100, 101, 1000)  # bearish
    signal = Candle(2, 100, 110, 99, 109, 2000)  # bullish engulfs
    assert is_bullish_engulfing(prior, signal)


def test_bearish_engulfing():
    prior = Candle(1, 100, 106, 99, 105, 1000)  # bullish
    signal = Candle(2, 106, 107, 95, 96, 2000)  # bearish engulfs
    assert is_bearish_engulfing(prior, signal)


def test_not_engulfing():
    prior = Candle(1, 100, 105, 99, 104, 1000)
    signal = Candle(2, 104, 106, 103, 105, 1000)
    assert not is_bullish_engulfing(prior, signal)
    assert not is_bearish_engulfing(prior, signal)

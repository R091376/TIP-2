from app.indicators.atr import AtrIndicator
from app.market.models import Candle


def _bars(n=20):
    out = []
    price = 100.0
    for i in range(n):
        o = price
        h = price + 2
        l = price - 1
        c = price + 0.5
        out.append(Candle(i, o, h, l, c, 1000))
        price = c
    return out


def test_atr_requires_period_plus_one():
    assert AtrIndicator.latest(_bars(14), 14) is None
    assert AtrIndicator.latest(_bars(15), 14) is not None


def test_atr_positive():
    atr = AtrIndicator.latest(_bars(30), 14)
    assert atr is not None and atr > 0

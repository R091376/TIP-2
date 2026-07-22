from app.market.models import Candle
from app.market.seed_merger import merge_candles


def test_merge_dedups_and_sorts():
    h = [Candle(1, 1, 1, 1, 1, 10), Candle(2, 2, 2, 2, 2, 20)]
    i = [Candle(2, 3, 3, 3, 3, 30), Candle(3, 4, 4, 4, 4, 40)]
    m = merge_candles(h, i)
    assert [c.time for c in m] == [1, 2, 3]
    assert m[1].close == 3  # intraday wins

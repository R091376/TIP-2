from app.market.models import Candle
from app.patterns.geometry import (
    first_close_through,
    line_price_at,
    scan_confirmed_pivots,
    signed_candle,
    unsigned_price,
)
from app.patterns.structure import is_pivot_high, is_pivot_low


def test_line_price_at_interpolation_and_zero_width():
    assert line_price_at(10, 100.0, 20, 110.0, 15) == 105.0
    assert line_price_at(10, 100.0, 10, 999.0, 15) == 100.0
    assert line_price_at(14, 106.0, 26, 105.5, 36) == 105.08333333333333


def test_first_close_through_picks_first_bar():
    bars = [
        Candle(1, 100, 101, 99, 100, 1),
        Candle(2, 100, 109, 99, 108.5, 1),
        Candle(3, 108, 110, 107, 109, 1),
    ]
    hit = first_close_through(bars, 0, 2, lambda _i: 108.0, True)
    assert hit == 1


def test_wick_through_does_not_count():
    bars = [
        Candle(1, 108, 110, 99, 107.5, 1),
        Candle(2, 107, 109, 106, 108.2, 1),
    ]
    hit = first_close_through(bars, 0, 1, lambda _i: 108.0, True)
    assert hit == 1


def test_scan_ignores_unconfirmed_tail():
    bars = [
        Candle(1, 1, 10, 1, 5, 1),
        Candle(2, 1, 20, 1, 5, 1),
        Candle(3, 1, 10, 1, 5, 1),
        Candle(4, 1, 30, 1, 5, 1),
    ]
    highs, _lows = scan_confirmed_pivots(bars, width=1, lookback=80)
    assert [p.index for p in highs] == [1]
    assert is_pivot_high(bars, 1, 1)
    assert not is_pivot_low(bars, 1, 1)


def test_signed_candle_swaps_high_low_and_negates():
    c = Candle(1, 10.0, 12.0, 8.0, 11.0, 5)
    s = signed_candle(c, -1)
    assert s.time == 1
    assert s.open == -10.0
    assert s.close == -11.0
    assert s.high == -8.0
    assert s.low == -12.0
    assert unsigned_price(s.high, -1) == 8.0

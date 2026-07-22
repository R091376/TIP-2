from app.market.models import Candle
from app.patterns.structure import (
    confirmed_pivot_index,
    is_pivot_high,
    is_pivot_low,
    sanitize_stop,
)


def test_confirmed_pivot_index():
    assert confirmed_pivot_index(5, 2) == 2
    assert confirmed_pivot_index(4, 2) is None


def test_pivot_high():
    # width 1: middle bar highest
    bars = [
        Candle(1, 1, 10, 1, 5, 1),
        Candle(2, 1, 20, 1, 5, 1),
        Candle(3, 1, 10, 1, 5, 1),
    ]
    assert is_pivot_high(bars, 1, 1)
    assert not is_pivot_low(bars, 1, 1)


def test_sanitize_stop_long():
    assert sanitize_stop(True, 100.0, 110.0, 2.0) < 100.0
    assert sanitize_stop(False, 100.0, 90.0, 2.0) > 100.0

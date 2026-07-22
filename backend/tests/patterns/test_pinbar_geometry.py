from app.market.models import Candle
from app.patterns.pinbar import classify_pinbar, pinbar_geometry


def test_hammer():
    # long lower wick, small body near top
    c = Candle(1, 100, 101, 90, 100.5, 1000)
    assert pinbar_geometry(c) == "hammer"


def test_shooting_star():
    c = Candle(1, 100, 110, 99.5, 100.2, 1000)
    assert pinbar_geometry(c) == "shooting_star"


def test_not_pinbar():
    c = Candle(1, 100, 105, 99, 104, 1000)
    assert pinbar_geometry(c) is None


def test_classify_with_atr():
    c = Candle(1, 100, 101, 90, 100.5, 1000)
    cfg = {
        "min_range_atr_mult": 0.5,
        "shadow_body_mult": 2.0,
        "max_body_range_ratio": 0.35,
        "max_opposite_wick_range_ratio": 0.25,
    }
    kind = classify_pinbar(c, atr=5.0, config=cfg)
    assert kind is not None
    assert kind.value == "hammer"

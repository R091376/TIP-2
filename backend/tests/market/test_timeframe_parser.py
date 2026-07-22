import pytest

from app.market.timeframe import parse_timeframe


def test_parse_minutes():
    spec = parse_timeframe("5m")
    assert spec.unit == "minutes"
    assert spec.interval == 5
    assert spec.interval_minutes() == 5


def test_parse_hours():
    spec = parse_timeframe("1h")
    assert spec.unit == "hours"
    assert spec.interval_minutes() == 60
    spec4 = parse_timeframe("4h")
    assert spec4.interval_minutes() == 240


def test_parse_days():
    spec = parse_timeframe("1d")
    assert spec.unit == "days"
    assert spec.interval_minutes() == 24 * 60


def test_invalid():
    with pytest.raises(ValueError):
        parse_timeframe("5x")

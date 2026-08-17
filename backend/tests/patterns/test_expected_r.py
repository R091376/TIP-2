import pytest

from app.patterns.expected_r import expected_r


def test_expected_r_formula():
    assert expected_r(0.6, 1.0) == pytest.approx(0.20)
    assert expected_r(0.4, 2.5) == pytest.approx(0.40)
    assert expected_r(0.8, 0.4) == pytest.approx(0.12)
    assert expected_r(1.0, 1.5) == pytest.approx(1.5)
    assert expected_r(0.0, 2.0) == pytest.approx(-1.0)


def test_expected_r_missing_inputs():
    assert expected_r(None, 1.5) is None
    assert expected_r(0.5, None) is None
    assert expected_r(None, None) is None

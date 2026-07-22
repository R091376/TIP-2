from app.patterns.structure import sanitize_stop


def test_long_stop_below_entry():
    s = sanitize_stop(True, 100.0, 105.0, 1.0)
    assert s < 100.0


def test_short_stop_above_entry():
    s = sanitize_stop(False, 100.0, 95.0, 1.0)
    assert s > 100.0


def test_valid_stop_preserved():
    assert sanitize_stop(True, 100.0, 98.0, 1.0) == 98.0
    assert sanitize_stop(False, 100.0, 102.0, 1.0) == 102.0

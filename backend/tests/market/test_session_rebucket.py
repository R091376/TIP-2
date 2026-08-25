"""Session rebucket: drop pre-open vendor stamps; keep Upstox 09:15 grid."""

from datetime import datetime
from zoneinfo import ZoneInfo

from app.market.models import Candle
from app.market.session_rebucket import rebucket_session_candles

IST = ZoneInfo("Asia/Kolkata")


def _t(y, m, d, h, minute) -> int:
    return int(datetime(y, m, d, h, minute, tzinfo=IST).timestamp())


def _c(y, m, d, h, minute, o=1.0, hi=2.0, lo=0.5, cl=1.5, v=10) -> Candle:
    return Candle(_t(y, m, d, h, minute), o, hi, lo, cl, v)


def test_upstox_aligned_5m_identity():
    raw = [
        _c(2026, 7, 10, 9, 15, o=100, hi=110, lo=99, cl=105, v=1),
        _c(2026, 7, 10, 9, 20, o=105, hi=108, lo=104, cl=107, v=2),
    ]
    out = rebucket_session_candles(raw, 5)
    assert [c.time for c in out] == [_t(2026, 7, 10, 9, 15), _t(2026, 7, 10, 9, 20)]
    assert out[0].open == 100 and out[0].close == 105


def test_drops_pre_open_5m_and_15m_labels():
    raw = [
        _c(2026, 7, 10, 9, 0, o=90, cl=91),  # pre-open 15m-style junk
        _c(2026, 7, 10, 9, 10, o=92, cl=93),  # pre-open 5m junk
        _c(2026, 7, 10, 9, 15, o=100, cl=101),
    ]
    out5 = rebucket_session_candles(raw, 5)
    assert [c.time for c in out5] == [_t(2026, 7, 10, 9, 15)]
    assert out5[0].open == 100

    out15 = rebucket_session_candles(raw, 15)
    assert [c.time for c in out15] == [_t(2026, 7, 10, 9, 15)]


def test_aggregates_off_grid_into_session_bucket():
    # Two stamps that floor into the same 5m bar 09:15
    raw = [
        _c(2026, 7, 10, 9, 15, o=100, hi=101, lo=99, cl=100.5, v=10),
        _c(2026, 7, 10, 9, 17, o=100.5, hi=102, lo=100, cl=101.5, v=5),  # off-grid
    ]
    out = rebucket_session_candles(raw, 5)
    assert len(out) == 1
    assert out[0].time == _t(2026, 7, 10, 9, 15)
    assert out[0].open == 100
    assert out[0].high == 102
    assert out[0].low == 99
    assert out[0].close == 101.5
    assert out[0].volume == 15


def test_1h_and_4h_upstox_grid():
    raw = [
        _c(2026, 7, 10, 8, 15, o=1, cl=2),  # dropped
        _c(2026, 7, 10, 9, 15, o=10, cl=11),
        _c(2026, 7, 10, 10, 15, o=11, cl=12),
        _c(2026, 7, 10, 5, 15, o=0, cl=1),  # dropped 4h junk
        _c(2026, 7, 10, 13, 15, o=20, cl=21),
    ]
    h1 = rebucket_session_candles(raw, 60)
    assert [c.time for c in h1] == [
        _t(2026, 7, 10, 9, 15),
        _t(2026, 7, 10, 10, 15),
        _t(2026, 7, 10, 13, 15),
    ]
    h4 = rebucket_session_candles(raw, 240)
    assert [c.time for c in h4] == [
        _t(2026, 7, 10, 9, 15),
        _t(2026, 7, 10, 13, 15),
    ]


def test_date_gated_cas_drop_not_fold():
    pre = [
        _c(2026, 7, 10, 15, 10, o=100, cl=101, v=1),
        _c(2026, 7, 10, 15, 25, o=101, cl=102, v=2),
    ]
    kept = rebucket_session_candles(pre, 5, 915)
    assert [c.time for c in kept] == [_t(2026, 7, 10, 15, 10), _t(2026, 7, 10, 15, 25)]

    post = [
        _c(2026, 8, 4, 15, 10, o=100, cl=101, v=1),
        _c(2026, 8, 4, 15, 25, o=101, cl=102, v=2),
    ]
    dropped = rebucket_session_candles(post, 5, 915)
    assert [c.time for c in dropped] == [_t(2026, 8, 4, 15, 10)]
    assert dropped[0].close == 101


def test_daily_unchanged():
    raw = [_c(2026, 7, 10, 0, 0, o=1, cl=2)]
    out = rebucket_session_candles(raw, 24 * 60)
    assert out[0].time == raw[0].time

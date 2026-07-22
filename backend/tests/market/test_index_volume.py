from app.market.index_volume import IndexVolumeSupport, normalize_ts_ms


def test_normalize_ts():
    assert normalize_ts_ms(1_700_000_000) == 1_700_000_000_000
    assert normalize_ts_ms(1_700_000_000_000) == 1_700_000_000_000


def test_day_vol_preferred():
    support = IndexVolumeSupport()
    bars = [
        {"interval": "I1", "vol": 10, "ts": 1_700_000_000_000},
        {"interval": "1d", "vol": 5000, "ts": 1_700_000_000_000},
    ]
    r = support.resolve("NSE_INDEX|Nifty 50", bars)
    assert r.source == "1d"
    assert r.volume_traded_today == 5000


def test_i1_session_rebuild():
    support = IndexVolumeSupport()
    bars1 = [{"interval": "I1", "vol": 100, "ts": 1_000}]
    r1 = support.resolve("K", bars1)
    assert r1.source == "I1"
    assert r1.volume_traded_today == 100
    bars2 = [{"interval": "I1", "vol": 50, "ts": 61_000}]
    r2 = support.resolve("K", bars2)
    assert r2.volume_traded_today == 150

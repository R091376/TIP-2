"""GET /api/symbols/{id}/sr — frozen Woodie overlay payload."""

from datetime import date

from app.sr.woodie import compute_woodie_open_v1


def test_sr_empty_for_seed_symbol(client):
    r = client.get("/api/symbols/NSE_INDEX|Nifty 50/sr")
    assert r.status_code == 200
    body = r.json()
    assert body["symbolId"] == "NSE_INDEX|Nifty 50"
    assert body["method"] == "woodie_open_v1"
    assert body["levels"] == []


def test_sr_unknown_symbol_404(client):
    r = client.get("/api/symbols/NSE_EQ|NOTONWATCHLIST/sr")
    assert r.status_code == 404


def test_sr_returns_frozen_row(client):
    c = client.app.state.container
    lv = compute_woodie_open_v1(12, 10, 11, 11.5, prev_open=10)
    day = date(2026, 8, 17)
    c.daily_sr_service._store.insert_if_absent(
        "NSE_INDEX|Nifty 50",
        day,
        lv,
        prev_candle_time=1,
        today_open_candle_time=2,
        freeze_source="backfill",
    )
    r = client.get(
        "/api/symbols/NSE_INDEX|Nifty 50/sr",
        params={"from": "2026-08-01", "to": "2026-08-20"},
    )
    assert r.status_code == 200
    rows = r.json()["levels"]
    assert len(rows) == 1
    assert rows[0]["sessionDate"] == "2026-08-17"
    assert rows[0]["freezeSource"] == "backfill"
    assert rows[0]["pp"] == lv.pp
    assert rows[0]["s2"] == lv.s2


def test_sr_rejects_inverted_range(client):
    r = client.get(
        "/api/symbols/NSE_INDEX|Nifty 50/sr",
        params={"from": "2026-08-20", "to": "2026-08-01"},
    )
    assert r.status_code == 400

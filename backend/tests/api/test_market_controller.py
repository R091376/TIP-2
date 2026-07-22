def test_timeframes(client):
    r = client.get("/api/market/timeframes")
    assert r.status_code == 200
    body = r.json()
    assert body["defaultTimeframe"] == "5m"
    assert "1m" in body["supported"]


def test_status(client):
    r = client.get("/api/market/status")
    assert r.status_code == 200
    body = r.json()
    assert "marketPhase" in body
    assert "bootstrapStatus" in body


def test_watchlist_seeded(client):
    r = client.get("/api/watchlist")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # Nifty 50 pinned even without instrument master
    if data:
        assert data[0]["symbolId"] == "NSE_INDEX|Nifty 50"

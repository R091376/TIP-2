"""Pattern day alerts API shape."""


def test_pattern_alerts_endpoint_shape(client):
    r = client.get("/api/pattern-alerts")
    assert r.status_code == 200
    body = r.json()
    assert "day" in body
    assert "count" in body
    assert "items" in body
    assert isinstance(body["items"], list)
    assert body["count"] == len(body["items"])


def test_pattern_alerts_accepts_day_param(client):
    r = client.get("/api/pattern-alerts", params={"day": "2026-07-22", "limit": 10})
    assert r.status_code == 200
    assert r.json()["day"] == "2026-07-22"


def test_pattern_alerts_bad_day(client):
    r = client.get("/api/pattern-alerts", params={"day": "not-a-date"})
    assert r.status_code == 400

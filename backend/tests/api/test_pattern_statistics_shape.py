"""FE expects bulk stats wrapper {minSampleSize,count,items} not bare array."""

from __future__ import annotations


def test_pattern_statistics_list_shape(client):
    r = client.get("/api/pattern-statistics")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, dict)
    assert "minSampleSize" in body
    assert "count" in body
    assert "items" in body
    assert isinstance(body["items"], list)
    assert body["count"] == len(body["items"])


def test_pattern_statistics_query_filters_accepted(client):
    r = client.get(
        "/api/pattern-statistics",
        params={"patternType": "breakout", "timeframe": "5m"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "items" in body

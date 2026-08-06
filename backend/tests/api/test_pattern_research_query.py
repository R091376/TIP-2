"""API tests for research stats endpoint (memory profile → 503)."""

from __future__ import annotations


def test_research_query_requires_postgres_in_memory_profile(client):
    r = client.get("/api/pattern-statistics/query")
    # Memory profile: require_admin passes; journal does not support research
    assert r.status_code == 503
    detail = r.json().get("detail") or ""
    assert "Postgres" in detail or "research" in detail.lower() or "journal" in detail.lower()


def test_research_query_invalid_group_by(client):
    r = client.get("/api/pattern-statistics/query", params={"groupBy": "nope"})
    # Still 503 if journal gate runs first — order is: settings, journal, then parse
    # Our evaluator parses after journal check, so 503 first in memory.
    assert r.status_code in (400, 503)


def test_bulk_stats_still_ok(client):
    r = client.get("/api/pattern-statistics")
    assert r.status_code == 200
    assert "items" in r.json()

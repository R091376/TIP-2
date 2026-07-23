def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "UP"
    # Memory profile tests: Postgres not required
    assert body["database"] in ("UP", "DOWN", "SKIPPED")
    assert body["database"] == "SKIPPED"
    # Lightweight by default — no journal count keys
    assert "patternEventCount" not in body


def test_health_database_field_present(client):
    r = client.get("/api/health")
    assert "database" in r.json()


def test_health_detail_query(client):
    r = client.get("/api/health?detail=true")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "UP"
    assert "journal" in body


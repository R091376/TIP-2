def test_login_memory_profile(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "ADMIN"
    me = client.get("/api/auth/me")
    assert me.status_code == 200


def test_logout(client):
    client.post("/api/auth/login", json={"username": "admin", "password": "x"})
    r = client.post("/api/auth/logout")
    assert r.status_code == 200

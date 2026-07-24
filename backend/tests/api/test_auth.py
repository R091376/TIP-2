def _auth_headers(login_body: dict) -> dict:
    token = login_body["accessToken"]
    return {"Authorization": f"Bearer {token}"}


def test_login_memory_profile(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200
    body = r.json()
    assert body["accessToken"]
    assert body["tokenType"] == "Bearer"
    assert body["expiresIn"] == 8 * 3600
    assert body["user"]["role"] == "ADMIN"
    me = client.get("/api/auth/me", headers=_auth_headers(body))
    assert me.status_code == 200
    assert me.json()["username"] == "admin"


def test_logout(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "x"})
    assert r.status_code == 200
    headers = _auth_headers(r.json())
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    out = client.post("/api/auth/logout")
    assert out.status_code == 200
    # Stateless JWT: server logout does not revoke; token still valid until exp.
    assert client.get("/api/auth/me", headers=headers).status_code == 200


def test_me_without_token_memory_open_profile(client):
    """Memory profile allows synthetic principal without Bearer (open security)."""
    me = client.get("/api/auth/me")
    assert me.status_code == 200

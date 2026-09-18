from __future__ import annotations

import time

from app.backtest.spec import PatternSpec


def _spec():
    return {
        "symbols": ["NSE_EQ|X"],
        "timeframes": ["5m"],
        "patternTypes": ["breakout"],
        "fromDate": "2023-11-01",
        "toDate": "2023-11-30",
        "targetR": 2.0,
        "trade": {"enabled": True, "product": "CNC"},
    }


def test_create_and_get_run(client):
    r = client.post("/api/backtests", json=_spec())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"]
    assert body["status"] in ("queued", "running", "done", "failed")
    run_id = body["id"]
    deadline = time.time() + 8
    last = None
    while time.time() < deadline:
        g = client.get(f"/api/backtests/{run_id}")
        assert g.status_code == 200, g.text
        last = g.json()
        if last["status"] in ("done", "failed"):
            break
        time.sleep(0.05)
    assert last is not None
    assert last["status"] in ("done", "failed")
    listed = client.get("/api/backtests")
    assert listed.status_code == 200
    assert any(item["id"] == run_id for item in listed.json()["items"])


def test_invalid_spec_400(client):
    r = client.post("/api/backtests", json={"symbols": [], "timeframes": ["5m"]})
    assert r.status_code == 400


def test_zero_target_r_400(client):
    r = client.post("/api/backtests", json={**_spec(), "targetR": 0})
    assert r.status_code == 400


def test_spec_roundtrip():
    spec = PatternSpec.from_dict(_spec())
    again = PatternSpec.from_dict(spec.to_dict())
    assert again.symbols == spec.symbols
    assert again.target_r == 2.0


def test_spec_omits_empty_target_r():
    raw = {**_spec()}
    del raw["targetR"]
    spec = PatternSpec.from_dict(raw)
    assert spec.target_r is None
    spec_blank = PatternSpec.from_dict({**_spec(), "targetR": ""})
    assert spec_blank.target_r is None


def test_spec_rejects_non_positive_target_r():
    for bad in (0, -1, 0.0):
        try:
            PatternSpec.from_dict({**_spec(), "targetR": bad})
            assert False, f"expected targetR={bad} to fail"
        except ValueError:
            pass


def test_spec_risk_band():
    spec = PatternSpec.from_dict({**_spec(), "minRiskR": 0.5, "maxRiskR": 1.5})
    assert spec.min_risk_r == 0.5
    assert spec.max_risk_r == 1.5
    dumped = spec.to_dict()
    assert dumped["minRiskR"] == 0.5
    assert dumped["maxRiskR"] == 1.5
    try:
        PatternSpec.from_dict({**_spec(), "minRiskR": 2, "maxRiskR": 1})
        assert False, "expected min > max to fail"
    except ValueError:
        pass


def test_clear_runs(client):
    r = client.post("/api/backtests", json=_spec())
    assert r.status_code == 200, r.text
    run_id = r.json()["id"]
    deadline = time.time() + 8
    while time.time() < deadline:
        g = client.get(f"/api/backtests/{run_id}")
        if g.status_code == 200 and g.json()["status"] in ("done", "failed"):
            break
        time.sleep(0.05)
    cleared = client.delete("/api/backtests")
    assert cleared.status_code == 200, cleared.text
    body = cleared.json()
    assert body.get("deleted", 0) >= 1
    listed = client.get("/api/backtests")
    assert listed.status_code == 200
    assert listed.json()["items"] == []

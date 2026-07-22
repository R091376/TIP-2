"""Live WebSocket subscribe validation edge cases."""

from __future__ import annotations


def test_ws_subscribe_success(client):
    with client.websocket_connect("/ws/live") as ws:
        ws.send_json({"type": "subscribe", "symbolId": "NSE_INDEX|Nifty 50", "timeframe": "5m"})
        msg = ws.receive_json()
        assert msg["type"] == "subscribed"
        assert msg["symbolId"] == "NSE_INDEX|Nifty 50"
        assert msg["timeframe"] == "5m"


def test_ws_invalid_json(client):
    with client.websocket_connect("/ws/live") as ws:
        ws.send_text("not-json{")
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "Invalid JSON" in msg["message"]


def test_ws_unsupported_type(client):
    with client.websocket_connect("/ws/live") as ws:
        ws.send_json({"type": "ping"})
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "Unsupported" in msg["message"]


def test_ws_unsupported_timeframe(client):
    with client.websocket_connect("/ws/live") as ws:
        ws.send_json(
            {"type": "subscribe", "symbolId": "NSE_INDEX|Nifty 50", "timeframe": "3m"}
        )
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "Unsupported timeframe" in msg["message"]


def test_ws_unknown_symbol(client):
    with client.websocket_connect("/ws/live") as ws:
        ws.send_json(
            {"type": "subscribe", "symbolId": "NSE_EQ|NOTONWATCHLIST", "timeframe": "5m"}
        )
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "not on watchlist" in msg["message"].lower()


def test_ws_default_symbol_when_missing(client):
    with client.websocket_connect("/ws/live") as ws:
        ws.send_json({"type": "subscribe", "timeframe": "5m"})
        msg = ws.receive_json()
        # seeded Nifty or default instrument key
        assert msg["type"] == "subscribed"
        assert msg["symbolId"]

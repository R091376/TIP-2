"""UpstoxFeedClient subscribe/unsubscribe rollback + extract-tick edge cases."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.config import Settings
from app.market.market_status import MarketStatusService
from app.market.upstox_feed import UpstoxFeedClient


@pytest.fixture()
def feed():
    settings = Settings()
    status = MarketStatusService()
    client = UpstoxFeedClient(settings, status)
    return client, status


def test_subscribe_while_disconnected_records_local_keys(feed):
    client, _ = feed
    client.subscribe({"A", "B"})
    assert client.subscribed_keys() == {"A", "B"}
    assert not client.is_connected()


def test_subscribe_failure_rolls_back_local_keys(feed):
    client, _ = feed
    client._subscribed = {"A"}
    client._connected = True

    def boom(_msg):
        raise RuntimeError("SOCKET_NOT_OPEN")

    client._ws_send = boom
    client.subscribe({"B"})
    assert client.subscribed_keys() == {"A"}
    assert "B" not in client.subscribed_keys()


def test_subscribe_success_adds_keys(feed):
    client, _ = feed
    client._subscribed = {"A"}
    client._connected = True
    sent: list[dict] = []
    client._ws_send = lambda msg: sent.append(msg)
    client.subscribe({"B"})
    assert client.subscribed_keys() == {"A", "B"}
    assert sent and sent[0]["method"] == "sub"
    assert "B" in sent[0]["data"]["instrumentKeys"]


def test_unsubscribe_failure_restores_local_keys(feed):
    client, _ = feed
    client._subscribed = {"A", "B"}
    client._connected = True

    def boom(_msg):
        raise RuntimeError("SOCKET_NOT_OPEN")

    client._ws_send = boom
    client.unsubscribe({"B"})
    assert client.subscribed_keys() == {"A", "B"}


def test_unsubscribe_success_removes_local_key(feed):
    client, _ = feed
    client._subscribed = {"A", "B"}
    client._connected = True
    sent: list[dict] = []
    client._ws_send = lambda msg: sent.append(msg)
    client.unsubscribe({"B"})
    assert client.subscribed_keys() == {"A"}
    assert sent and sent[0]["method"] == "unsub"


def test_disconnect_clears_local_set(feed):
    client, status = feed
    client._subscribed = {"A"}
    client._connected = True
    client._ws_send = lambda msg: None
    client.disconnect()
    assert client.subscribed_keys() == set()
    assert not client.is_connected()
    assert status.is_live_feed_connected() is False


def test_connect_requires_handler(feed):
    client, _ = feed
    with pytest.raises(ValueError):
        client.connect({"A"}, None)  # type: ignore


def test_extract_tick_json_market_ff(feed):
    client, _ = feed
    tick = client._extract_tick_json(
        "NSE_EQ|INE002A01018",
        {
            "fullFeed": {
                "marketFF": {
                    "ltpc": {"ltp": 2500.5, "ltt": 1_700_000_000},  # seconds → ms
                    "vtt": 12_345,
                }
            }
        },
    )
    assert tick is not None
    assert tick.instrument_key == "NSE_EQ|INE002A01018"
    assert tick.price == 2500.5
    assert tick.volume_traded_today == 12_345
    assert tick.timestamp_ms == 1_700_000_000_000  # normalized


def test_extract_tick_json_missing_ltp_returns_none(feed):
    client, _ = feed
    tick = client._extract_tick_json(
        "K",
        {"fullFeed": {"marketFF": {"ltpc": {}, "vtt": 1}}},
    )
    assert tick is None


def test_extract_tick_json_index_ff_uses_day_volume(feed):
    client, _ = feed
    tick = client._extract_tick_json(
        "NSE_INDEX|Nifty 50",
        {
            "fullFeed": {
                "indexFF": {
                    "ltpc": {"ltp": 24500.0, "ltt": 1_700_000_000_000},
                    "marketOHLC": {
                        "ohlc": [
                            {"interval": "1d", "vol": 999_001, "ts": 1},
                            {"interval": "I1", "vol": 100, "ts": 1_700_000_000_000},
                        ]
                    },
                }
            }
        },
    )
    assert tick is not None
    assert tick.price == 24500.0
    assert tick.volume_traded_today == 999_001


def test_extract_tick_json_index_ff_i1_session_sum(feed):
    client, _ = feed
    key = "NSE_INDEX|Nifty 50"
    # first minute
    t1 = client._extract_tick_json(
        key,
        {
            "fullFeed": {
                "indexFF": {
                    "ltpc": {"ltp": 100.0, "ltt": 1_000},
                    "marketOHLC": {
                        "ohlc": [{"interval": "I1", "vol": 10, "ts": 1_000}]
                    },
                }
            }
        },
    )
    assert t1 is not None
    assert t1.volume_traded_today == 10
    # next minute rolls prior vol into closed_sum
    t2 = client._extract_tick_json(
        key,
        {
            "fullFeed": {
                "indexFF": {
                    "ltpc": {"ltp": 101.0, "ltt": 61_000},
                    "marketOHLC": {
                        "ohlc": [{"interval": "I1", "vol": 7, "ts": 61_000}]
                    },
                }
            }
        },
    )
    assert t2 is not None
    assert t2.volume_traded_today == 17


def test_handle_json_market_info_updates_phase(feed):
    client, status = feed
    client._handle_json(
        {
            "type": "market_info",
            "marketInfo": {"segmentStatus": {"NSE_EQ": "NORMAL_OPEN"}},
        }
    )
    from app.market.nse_clock import MarketPhase

    assert status.get_market_phase() == MarketPhase.OPEN


def test_handle_json_dispatches_tick(feed):
    client, _ = feed
    ticks = []
    client._tick_handler = ticks.append
    client._handle_json(
        {
            "feeds": {
                "NSE_EQ|X": {
                    "fullFeed": {
                        "marketFF": {
                            "ltpc": {"ltp": 10.0, "ltt": 1_700_000_000_000},
                            "vtt": 5,
                        }
                    }
                }
            }
        }
    )
    assert len(ticks) == 1
    assert ticks[0].price == 10.0


def test_unsubscribe_clears_index_volume_tracker(feed):
    client, _ = feed
    client._subscribed = {"NSE_INDEX|Nifty 50"}
    client._index_volume.resolve(
        "NSE_INDEX|Nifty 50",
        [{"interval": "I1", "vol": 1, "ts": 1000}],
    )
    client._connected = False
    client.unsubscribe({"NSE_INDEX|Nifty 50"})
    assert "NSE_INDEX|Nifty 50" not in client._index_volume._trackers

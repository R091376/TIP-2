from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from zoneinfo import ZoneInfo

from app.market.bootstrap import MarketBootstrapService
from app.market.models import Tick
from app.market.nse_clock import MarketPhase, phase_at
from app.watchlist.models import SymbolBootstrapStatus, WatchlistEntry

IST = ZoneInfo("Asia/Kolkata")


def _entry(symbol_id, ts, segment="NSE_EQ", itype="EQ"):
    return WatchlistEntry(
        symbol_id=symbol_id,
        trading_symbol=ts,
        exchange="NSE",
        segment=segment,
        instrument_type=itype,
        display_name=ts,
        added_at=datetime(2026, 8, 4, tzinfo=IST),
        active=True,
        bootstrap_status=SymbolBootstrapStatus.READY,
        bootstrap_error=None,
    )


def _tick(key, h, m, price=100.0):
    ts = datetime(2026, 8, 4, h, m, tzinfo=IST)
    return Tick(
        instrument_key=key,
        timestamp_ms=int(ts.timestamp() * 1000),
        price=price,
        volume_traded_today=1,
    )


def _svc():
    settings = SimpleNamespace(
        cas_session_enabled=True,
        supported_timeframes=["5m"],
    )
    engine = MagicMock()
    watchlist = MagicMock()
    svc = MarketBootstrapService(
        market_data_provider=MagicMock(),
        candle_engine=engine,
        settings=settings,
        market_status=MagicMock(),
        watchlist_repository=watchlist,
        instruments=None,
    )
    return svc, engine, watchlist


def _freeze(monkeypatch, h, m):
    frozen = datetime(2026, 8, 4, h, m, tzinfo=IST)

    def fake_phase_at(now, close_minutes=None):
        return phase_at(frozen, close_minutes)

    monkeypatch.setattr("app.market.nse_clock.phase_at", fake_phase_at)
    monkeypatch.setattr(
        "app.market.nse_clock.phase_from_clock",
        lambda: phase_at(frozen),
    )


def test_cas_tick_after_1515_dropped(monkeypatch):
    _freeze(monkeypatch, 15, 16)
    svc, engine, watchlist = _svc()
    svc._remember_close(_entry("NSE_EQ|REL", "RELIANCE"))
    svc.on_tick(_tick("NSE_EQ|REL", 15, 16))
    engine.process_tick.assert_not_called()
    watchlist.find_by_symbol_id.assert_not_called()
    watchlist.find_all_active.assert_not_called()


def test_non_cas_tick_1516_processed(monkeypatch):
    _freeze(monkeypatch, 15, 16)
    svc, engine, watchlist = _svc()
    svc._remember_close(_entry("NSE_EQ|FOO", "FOOBAR"))
    tick = _tick("NSE_EQ|FOO", 15, 16)
    svc.on_tick(tick)
    engine.process_tick.assert_called()
    watchlist.find_by_symbol_id.assert_not_called()


def test_both_dropped_after_1530(monkeypatch):
    _freeze(monkeypatch, 15, 31)
    svc, engine, watchlist = _svc()
    svc._remember_close(_entry("NSE_EQ|REL", "RELIANCE"))
    svc.on_tick(_tick("NSE_EQ|REL", 15, 31))
    engine.process_tick.assert_not_called()
    watchlist.find_by_symbol_id.assert_not_called()

from datetime import datetime, timezone

from app.watchlist.models import SymbolBootstrapStatus, WatchlistEntry
from app.watchlist.repository import InMemoryWatchlistRepository


def _entry(sid, ts="AAA"):
    return WatchlistEntry(
        symbol_id=sid,
        trading_symbol=ts,
        exchange="NSE",
        segment="NSE_EQ",
        instrument_type="EQ",
        display_name=ts,
        added_at=datetime.now(timezone.utc),
        active=True,
        bootstrap_status=SymbolBootstrapStatus.READY,
        bootstrap_error=None,
    )


def test_order_and_public_active():
    repo = InMemoryWatchlistRepository()
    repo.save(_entry("a", "A"))
    repo.save(_entry("b", "B"))
    active = repo.find_all_active()
    assert [e.symbol_id for e in active] == ["a", "b"]
    assert repo.find_primary().symbol_id == "a"


def test_removing_excluded_from_public():
    repo = InMemoryWatchlistRepository()
    e = _entry("a", "A")
    repo.save(e)
    repo.save(
        WatchlistEntry(
            symbol_id="a",
            trading_symbol="A",
            exchange="NSE",
            segment="NSE_EQ",
            instrument_type="EQ",
            display_name="A",
            added_at=e.added_at,
            active=True,
            bootstrap_status=SymbolBootstrapStatus.REMOVING,
            bootstrap_error=None,
        )
    )
    assert repo.count_active() == 0
    assert not repo.contains_symbol_id("a")

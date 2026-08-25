from datetime import date, datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.config import Settings
from app.market.nse_clock import MarketPhase, phase_at
from app.market.session_policy import (
    SessionKind,
    cas_as_of,
    cas_trading_symbols,
    cts_close_minutes,
    due_cts_instruments,
    effective_close_minutes_for_date,
    session_kind,
    session_kind_from_cache,
)

IST = ZoneInfo("Asia/Kolkata")


def test_seed_equities_are_cas():
    symbols = cas_trading_symbols()
    assert len(symbols) >= 200
    for name in Settings().seed_symbols:
        if name == "Nifty 50":
            continue
        assert name.upper() in symbols, name


def test_session_kind_matrix():
    assert session_kind("RELIANCE") is SessionKind.CAS_CASH
    assert session_kind("FOOBAR") is SessionKind.CASH
    assert (
        session_kind("Nifty 50", segment="NSE_INDEX", instrument_type="INDEX")
        is SessionKind.INDEX
    )


def test_flag_off_close_is_930():
    assert cts_close_minutes(SessionKind.CAS_CASH, cas_enabled=False) == 15 * 60 + 30
    assert cts_close_minutes(SessionKind.INDEX, cas_enabled=True) == 15 * 60 + 15


def test_cas_as_of_and_effective_close():
    assert cas_as_of() == date(2026, 8, 3)
    assert effective_close_minutes_for_date(date(2026, 7, 10), 915) == 930
    assert effective_close_minutes_for_date(date(2026, 8, 3), 915) == 915
    assert effective_close_minutes_for_date(date(2026, 8, 4), 930) == 930


def test_phase_at_optional_close():
    assert phase_at(datetime(2026, 8, 4, 15, 15, tzinfo=IST), 915) == MarketPhase.CLOSED
    assert phase_at(datetime(2026, 8, 4, 15, 15, tzinfo=IST)) == MarketPhase.OPEN
    assert phase_at(datetime(2026, 8, 4, 15, 29, tzinfo=IST)) == MarketPhase.OPEN


def test_session_kind_from_cache_index_prefix():
    class Empty:
        def find_by_instrument_key(self, _k):
            return None

    assert session_kind_from_cache("NSE_INDEX|Nifty 50", Empty()) is SessionKind.INDEX
    assert session_kind_from_cache("NSE_EQ|UNKNOWN", Empty()) is SessionKind.CASH


def _entry(symbol_id, ts, segment="NSE_EQ", itype="EQ"):
    return SimpleNamespace(
        symbol_id=symbol_id,
        trading_symbol=ts,
        segment=segment,
        instrument_type=itype,
    )


def test_due_weekend_empty():
    entries = [_entry("k1", "RELIANCE"), _entry("k2", "FOOBAR")]
    sat = datetime(2026, 8, 8, 16, 0, tzinfo=IST)
    assert due_cts_instruments(sat, entries, set(), cas_enabled=True) == []


def test_due_cas_then_cash():
    entries = [
        _entry("cas", "RELIANCE"),
        _entry("idx", "Nifty 50", "NSE_INDEX", "INDEX"),
        _entry("cash", "FOOBAR"),
    ]
    t1516 = datetime(2026, 8, 4, 15, 16, tzinfo=IST)
    due = due_cts_instruments(t1516, entries, set(), cas_enabled=True)
    kinds = {k: kind for k, kind in due}
    assert kinds["cas"] is SessionKind.CAS_CASH
    assert kinds["idx"] is SessionKind.INDEX
    assert "cash" not in kinds

    finalized = {(t1516.date(), "cas", "cas_cash"), (t1516.date(), "idx", "index")}
    t1531 = datetime(2026, 8, 4, 15, 31, tzinfo=IST)
    due2 = due_cts_instruments(t1531, entries, finalized, cas_enabled=True)
    assert due2 == [("cash", SessionKind.CASH)]

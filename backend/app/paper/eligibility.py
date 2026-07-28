"""Instrument eligibility for paper trading."""

from __future__ import annotations

from app.watchlist.models import SymbolBootstrapStatus, WatchlistEntry


def is_paper_tradable(entry: WatchlistEntry, *, require_ready: bool = False) -> bool:
    if not entry.active:
        return False
    if entry.bootstrap_status == SymbolBootstrapStatus.REMOVING:
        return False
    if require_ready and entry.bootstrap_status != SymbolBootstrapStatus.READY:
        return False
    seg = (entry.segment or "").upper()
    if "INDEX" in seg or entry.symbol_id.startswith("NSE_INDEX"):
        return False
    if seg != "NSE_EQ":
        return False
    itype = (entry.instrument_type or "").upper()
    return itype in ("EQ", "BE")

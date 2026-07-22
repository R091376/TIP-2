"""WatchlistService edge cases: capacity, duplicates, validation."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.config import Settings
from app.instrument.cache import InstrumentMasterCache
from app.instrument.models import ResolvedInstrument
from app.watchlist.models import SymbolBootstrapStatus, WatchlistEntry
from app.watchlist.repository import InMemoryWatchlistRepository
from app.watchlist.service import WatchlistService


@pytest.fixture()
def svc():
    settings = Settings()
    object.__setattr__(settings, "hard_max_size", 3)
    object.__setattr__(settings, "soft_warn_size", 2)
    object.__setattr__(settings, "seed_symbols", [])
    repo = InMemoryWatchlistRepository()
    instruments = MagicMock(spec=InstrumentMasterCache)

    def resolve(sym: str):
        u = sym.upper()
        return ResolvedInstrument(
            instrument_key=f"NSE_EQ|{u}",
            trading_symbol=u,
            exchange="NSE",
            segment="NSE_EQ",
            instrument_type="EQ",
            display_name=u,
        )

    instruments.resolve.side_effect = resolve
    instruments.find_by_instrument_key.side_effect = lambda k: ResolvedInstrument(
        instrument_key=k,
        trading_symbol=k.split("|")[-1],
        exchange="NSE",
        segment="NSE_EQ",
        instrument_type="EQ",
        display_name=k.split("|")[-1],
    )
    service = WatchlistService(repo, settings, instruments)
    return service, repo

def test_add_duplicate_raises_409(svc):
    service, repo = svc
    repo.save(
        WatchlistEntry(
            symbol_id="NSE_EQ|RELIANCE",
            trading_symbol="RELIANCE",
            exchange="NSE",
            segment="NSE_EQ",
            instrument_type="EQ",
            display_name="RELIANCE",
            added_at=datetime.now(timezone.utc),
            active=True,
            bootstrap_status=SymbolBootstrapStatus.READY,
            bootstrap_error=None,
        )
    )
    with pytest.raises(HTTPException) as ei:
        service.add("RELIANCE", None)
    assert ei.value.status_code == 409


def test_add_at_hard_max_raises_409(svc):
    service, repo = svc
    for i, sym in enumerate(["A", "B", "C"]):
        repo.save(
            WatchlistEntry(
                symbol_id=f"NSE_EQ|{sym}",
                trading_symbol=sym,
                exchange="NSE",
                segment="NSE_EQ",
                instrument_type="EQ",
                display_name=sym,
                added_at=datetime.now(timezone.utc),
                active=True,
                bootstrap_status=SymbolBootstrapStatus.READY,
                bootstrap_error=None,
            )
        )
    with pytest.raises(HTTPException) as ei:
        service.add("D", None)
    assert ei.value.status_code == 409
    assert "full" in ei.value.detail.lower()


def test_add_requires_symbol_or_key(svc):
    service, _ = svc
    with pytest.raises(HTTPException) as ei:
        service.add(None, None)
    assert ei.value.status_code == 400


def test_add_rejects_control_chars(svc):
    service, _ = svc
    with pytest.raises(HTTPException) as ei:
        service.add("REL\x00IANCE", None)
    assert ei.value.status_code == 400


def test_remove_unknown_404(svc):
    service, _ = svc
    with pytest.raises(HTTPException) as ei:
        service.remove("missing")
    assert ei.value.status_code == 404


def test_remove_blank_404(svc):
    service, _ = svc
    with pytest.raises(HTTPException) as ei:
        service.remove("  ")
    assert ei.value.status_code == 404

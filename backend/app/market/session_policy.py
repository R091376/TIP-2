"""CAS / F&O cash session policy. Global NSE clock stays 15:30; this is per-symbol CTS."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Any, Sequence

from app.market.nse_clock import is_trading_day

logger = logging.getLogger(__name__)

_CAS_JSON = Path(__file__).parent / "data" / "cas_fo_cash_symbols.json"

CTS_CLOSE_CASH = 15 * 60 + 30  # 930
CTS_CLOSE_CAS = 15 * 60 + 15  # 915


class SessionKind(str, Enum):
    CAS_CASH = "cas_cash"
    CASH = "cash"
    INDEX = "index"


CTS_CLOSE_MINUTES = {
    SessionKind.CAS_CASH: CTS_CLOSE_CAS,
    SessionKind.INDEX: CTS_CLOSE_CAS,
    SessionKind.CASH: CTS_CLOSE_CASH,
}


@lru_cache(maxsize=1)
def _cas_payload() -> dict:
    try:
        raw = json.loads(_CAS_JSON.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError("CAS JSON root must be an object")
        n = len(raw.get("trading_symbols") or [])
        logger.info("CAS universe loaded: n=%s", n)
        return raw
    except Exception:
        logger.exception("CAS universe JSON failed; treating all equities as non-CAS")
        return {"as_of": "2026-08-03", "trading_symbols": []}


@lru_cache(maxsize=1)
def cas_trading_symbols() -> frozenset[str]:
    raw = _cas_payload().get("trading_symbols") or []
    return frozenset(str(s).strip().upper() for s in raw if s and str(s).strip())


@lru_cache(maxsize=1)
def cas_as_of() -> date:
    raw = _cas_payload()
    try:
        return date.fromisoformat(str(raw.get("as_of") or "2026-08-03"))
    except ValueError:
        return date(2026, 8, 3)


def session_kind(
    trading_symbol: str | None,
    *,
    segment: str | None = None,
    instrument_type: str | None = None,
) -> SessionKind:
    seg = (segment or "").upper()
    itype = (instrument_type or "").upper()
    if "INDEX" in seg or itype == "INDEX":
        return SessionKind.INDEX
    ts = (trading_symbol or "").strip().upper()
    if ts and ts in cas_trading_symbols():
        return SessionKind.CAS_CASH
    return SessionKind.CASH


def session_kind_from_entry(entry: Any) -> SessionKind:
    return session_kind(
        getattr(entry, "trading_symbol", None),
        segment=getattr(entry, "segment", None),
        instrument_type=getattr(entry, "instrument_type", None),
    )


def session_kind_from_instrument(inst: Any) -> SessionKind:
    return session_kind(
        getattr(inst, "trading_symbol", None),
        segment=getattr(inst, "segment", None),
        instrument_type=getattr(inst, "instrument_type", None),
    )


def session_kind_from_cache(instrument_key: str, instruments: Any) -> SessionKind:
    inst = None
    if instruments is not None and hasattr(instruments, "find_by_instrument_key"):
        inst = instruments.find_by_instrument_key(instrument_key)
    if inst is not None:
        return session_kind_from_instrument(inst)
    if (instrument_key or "").upper().startswith("NSE_INDEX"):
        return SessionKind.INDEX
    return SessionKind.CASH


def cts_close_minutes(kind: SessionKind, *, cas_enabled: bool = True) -> int:
    if not cas_enabled:
        return CTS_CLOSE_CASH
    return CTS_CLOSE_MINUTES[kind]


def cts_end_hhmm(kind: SessionKind, *, cas_enabled: bool = True) -> str:
    m = cts_close_minutes(kind, cas_enabled=cas_enabled)
    return f"{m // 60:02d}:{m % 60:02d}"


def effective_close_minutes_for_date(
    bar_ist_date: date,
    live_close_minutes: int,
    *,
    as_of: date | None = None,
) -> int:
    """Historical remap/overlay: CAS 15:15 only on/after go-live. Live ticks ignore this."""
    if live_close_minutes >= CTS_CLOSE_CASH:
        return live_close_minutes
    start = as_of if as_of is not None else cas_as_of()
    if bar_ist_date < start:
        return CTS_CLOSE_CASH
    return live_close_minutes


def session_payload(
    trading_symbol: str | None,
    *,
    segment: str | None = None,
    instrument_type: str | None = None,
    cas_enabled: bool = True,
) -> dict[str, str]:
    kind = session_kind(
        trading_symbol, segment=segment, instrument_type=instrument_type
    )
    return {
        "sessionKind": kind.value,
        "ctsEnd": cts_end_hhmm(kind, cas_enabled=cas_enabled),
    }


def due_cts_instruments(
    now_ist: datetime,
    entries: Sequence[Any],
    finalized: set[tuple[date, str, str]],
    *,
    cas_enabled: bool,
) -> list[tuple[str, SessionKind]]:
    """Keys that must finalize + expire now. Empty off-session / weekends."""
    day = now_ist.date()
    if not is_trading_day(day):
        return []
    now_minutes = now_ist.hour * 60 + now_ist.minute
    due: list[tuple[str, SessionKind]] = []
    for entry in entries:
        kind = session_kind_from_entry(entry)
        close = cts_close_minutes(kind, cas_enabled=cas_enabled)
        if now_minutes < close:
            continue
        token = (day, entry.symbol_id, kind.value)
        if token in finalized:
            continue
        due.append((entry.symbol_id, kind))
    return due

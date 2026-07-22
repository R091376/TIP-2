from __future__ import annotations

import gzip
import json
import logging
import threading
from pathlib import Path

import httpx

from app.config import Settings
from app.instrument.models import InstrumentNotFoundException, ResolvedInstrument

logger = logging.getLogger(__name__)

SEGMENT_NSE_EQ = "NSE_EQ"
SEGMENT_NSE_INDEX = "NSE_INDEX"
TYPE_EQ = "EQ"
TYPE_BE = "BE"
CACHE_FILE_NAME = "NSE.json.gz"


class InstrumentMasterCache:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._lock = threading.RLock()
        self._loaded = False
        self._by_key: dict[str, ResolvedInstrument] = {}
        self._eq_by_ts: dict[str, ResolvedInstrument] = {}
        self._index_by_ts: dict[str, ResolvedInstrument] = {}
        self._index_by_name: dict[str, ResolvedInstrument] = {}

    def ensure_loaded(self) -> None:
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return
            try:
                cache_file = Path(self._settings.instruments_cache_dir) / CACHE_FILE_NAME
                cache_file.parent.mkdir(parents=True, exist_ok=True)
                need_download = (
                    self._settings.instruments_refresh_on_startup
                    or not cache_file.is_file()
                )
                if need_download:
                    self._download_best_effort(cache_file)
                if cache_file.is_file():
                    try:
                        self._load_from_gzip(cache_file)
                        logger.info(
                            "Instrument master loaded: eq=%s index=%s keys=%s",
                            len(self._eq_by_ts),
                            len(self._index_by_ts),
                            len(self._by_key),
                        )
                    except Exception as e:
                        logger.error("Failed to parse instrument master: %s", e)
                        self._clear()
                else:
                    logger.warning("Instrument master unavailable; indexes empty")
                    self._clear()
            except Exception as e:
                logger.error("Instrument master ensure_loaded failed: %s", e)
                self._clear()
            finally:
                self._loaded = True

    def resolve(self, trading_symbol: str) -> ResolvedInstrument:
        self.ensure_loaded()
        normalized = _normalize(trading_symbol)
        if not normalized:
            raise InstrumentNotFoundException(trading_symbol or "")
        if normalized in self._eq_by_ts:
            return self._eq_by_ts[normalized]
        if normalized in self._index_by_ts:
            return self._index_by_ts[normalized]
        if normalized in self._index_by_name:
            return self._index_by_name[normalized]
        raise InstrumentNotFoundException(trading_symbol)

    def find_by_instrument_key(self, instrument_key: str) -> ResolvedInstrument | None:
        self.ensure_loaded()
        if not instrument_key or not instrument_key.strip():
            return None
        return self._by_key.get(instrument_key.strip())

    def search(self, query: str, limit: int = 15) -> list[ResolvedInstrument]:
        self.ensure_loaded()
        q = _normalize(query)
        if len(q) < 2:
            return []
        lim = min(50, max(1, limit))
        scored: list[tuple[int, ResolvedInstrument]] = []
        for inst in self._by_key.values():
            if inst.instrument_type == TYPE_BE:
                continue
            score = score_match(q, inst)
            if score >= 0:
                scored.append((score, inst))
        scored.sort(key=lambda x: (x[0], x[1].trading_symbol.lower(), x[1].instrument_key))
        return [s[1] for s in scored[:lim]]

    def load_from_file(self, path: Path) -> None:
        with self._lock:
            name = path.name.lower()
            if name.endswith(".gz"):
                self._load_from_gzip(path)
            else:
                with path.open("rb") as f:
                    self._parse_and_index(f.read())
            self._loaded = True

    def is_loaded(self) -> bool:
        return self._loaded

    def size(self) -> int:
        return len(self._by_key)

    def _download_best_effort(self, cache_file: Path) -> None:
        try:
            with httpx.Client(timeout=60.0, follow_redirects=True) as client:
                r = client.get(self._settings.instruments_master_url)
                r.raise_for_status()
                cache_file.write_bytes(r.content)
                logger.info("Downloaded instrument master to %s", cache_file)
        except Exception as e:
            logger.warning("Instrument master download failed: %s", e)

    def _load_from_gzip(self, path: Path) -> None:
        with gzip.open(path, "rb") as f:
            self._parse_and_index(f.read())

    def _parse_and_index(self, raw: bytes) -> None:
        root = json.loads(raw)
        if not isinstance(root, list):
            raise ValueError("Instrument master root must be a JSON array")
        by_key: dict[str, ResolvedInstrument] = {}
        eq_by_ts: dict[str, ResolvedInstrument] = {}
        index_by_ts: dict[str, ResolvedInstrument] = {}
        index_by_name: dict[str, ResolvedInstrument] = {}

        for node in root:
            if not isinstance(node, dict):
                continue
            segment = _text(node, "segment")
            if segment == SEGMENT_NSE_EQ:
                _index_equity(node, by_key, eq_by_ts)
            elif segment == SEGMENT_NSE_INDEX:
                _index_index(node, by_key, index_by_ts, index_by_name)

        self._by_key = by_key
        self._eq_by_ts = eq_by_ts
        self._index_by_ts = index_by_ts
        self._index_by_name = index_by_name

    def _clear(self) -> None:
        self._by_key = {}
        self._eq_by_ts = {}
        self._index_by_ts = {}
        self._index_by_name = {}


def score_match(normalized_query: str, instrument: ResolvedInstrument) -> int:
    ts = _normalize(instrument.trading_symbol)
    dn = _normalize(instrument.display_name)
    if ts:
        if ts == normalized_query:
            return 0
        if ts.startswith(normalized_query):
            return 1
        if normalized_query in ts:
            return 2
    if dn:
        if dn == normalized_query:
            return 3
        if dn.startswith(normalized_query):
            return 4
        if normalized_query in dn:
            return 5
    return -1


def _normalize(s: str | None) -> str:
    if s is None:
        return ""
    return s.strip().upper()


def _text(node: dict, key: str) -> str | None:
    v = node.get(key)
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _index_equity(node, by_key, eq_by_ts) -> None:
    instrument_type = _text(node, "instrument_type")
    if instrument_type not in (TYPE_EQ, TYPE_BE):
        return
    instrument_key = _text(node, "instrument_key")
    trading_symbol = _text(node, "trading_symbol")
    if not instrument_key or not trading_symbol:
        return
    resolved = ResolvedInstrument(
        instrument_key=instrument_key,
        trading_symbol=trading_symbol,
        exchange=_text(node, "exchange") or "NSE",
        segment=SEGMENT_NSE_EQ,
        instrument_type=instrument_type,
        display_name=_display_name(node, trading_symbol),
    )
    by_key[instrument_key] = resolved
    norm = _normalize(trading_symbol)
    existing = eq_by_ts.get(norm)
    # Prefer EQ over BE
    if existing is None or (existing.instrument_type == TYPE_BE and instrument_type == TYPE_EQ):
        eq_by_ts[norm] = resolved


def _index_index(node, by_key, index_by_ts, index_by_name) -> None:
    instrument_key = _text(node, "instrument_key")
    trading_symbol = _text(node, "trading_symbol") or _text(node, "name")
    if not instrument_key:
        return
    name = _text(node, "name") or trading_symbol or instrument_key
    resolved = ResolvedInstrument(
        instrument_key=instrument_key,
        trading_symbol=trading_symbol or name,
        exchange=_text(node, "exchange") or "NSE",
        segment=SEGMENT_NSE_INDEX,
        instrument_type="INDEX",
        display_name=name,
    )
    by_key[instrument_key] = resolved
    if trading_symbol:
        index_by_ts[_normalize(trading_symbol)] = resolved
    if name:
        index_by_name[_normalize(name)] = resolved


def _display_name(node: dict, fallback: str) -> str:
    return _text(node, "name") or _text(node, "trading_symbol") or fallback


# Re-export for service imports
__all__ = [
    "InstrumentMasterCache",
    "InstrumentNotFoundException",
    "ResolvedInstrument",
    "score_match",
]

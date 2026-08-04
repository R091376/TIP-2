from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from app.api.deps import AuthUser
from app.watchlist.models import SymbolBootstrapStatus

router = APIRouter(prefix="/api/symbols", tags=["symbols"])


def _candle_dto(c) -> dict:
    return {
        "time": c.time,
        "open": c.open,
        "high": c.high,
        "low": c.low,
        "close": c.close,
        "volume": c.volume,
    }


@router.get("/{symbol_id:path}/candles")
def get_candles(
    symbol_id: str,
    request: Request,
    _user: AuthUser,
    timeframe: str | None = None,
    from_: int | None = Query(None, alias="from"),
    to: int | None = None,
):
    # strip trailing path segments if any
    if symbol_id.endswith("/candles"):
        symbol_id = symbol_id[: -len("/candles")]
    c = request.app.state.container
    tf = timeframe if timeframe and timeframe.strip() else c.settings.default_timeframe
    if tf not in c.settings.supported_timeframes and tf != c.settings.default_timeframe:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported timeframe: {tf}. Supported: {c.settings.supported_timeframes}",
        )

    entry = c.watchlist_repo.find_by_symbol_id(symbol_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Symbol not on watchlist: {symbol_id}")
    if entry.bootstrap_status == SymbolBootstrapStatus.REMOVING or not entry.active:
        raise HTTPException(status_code=404, detail=f"Symbol not on watchlist: {symbol_id}")
    if entry.bootstrap_status == SymbolBootstrapStatus.FAILED:
        raise HTTPException(
            status_code=503,
            detail=entry.bootstrap_error or f"Bootstrap failed for symbol: {symbol_id}",
        )
    if entry.bootstrap_status == SymbolBootstrapStatus.PENDING:
        return []

    candles = c.candle_engine.get_all_candles(symbol_id, tf)
    out = []
    for candle in candles:
        if from_ is not None and candle.time < from_:
            continue
        if to is not None and candle.time > to:
            continue
        out.append(_candle_dto(candle))
    return out


@router.get("/{symbol_id:path}/patterns")
def get_patterns(
    symbol_id: str,
    request: Request,
    _user: AuthUser,
    status: str | None = "active",
    timeframe: str | None = None,
    instanceId: str | None = None,
):
    if symbol_id.endswith("/patterns"):
        symbol_id = symbol_id[: -len("/patterns")]
    c = request.app.state.container
    if not c.settings.pattern_enabled:
        raise HTTPException(status_code=503, detail="Pattern feature disabled")
    entry = c.watchlist_repo.find_by_symbol_id(symbol_id)
    if entry is None or not entry.active:
        raise HTTPException(status_code=404, detail=f"Symbol not on watchlist: {symbol_id}")

    # Single-instance lookup (inspect panel) — avoids multi-list fan-out on the client.
    if instanceId:
        one = c.pattern_service.get_instance(symbol_id, instanceId)
        instances = [one] if one else []
        return {
            "symbolId": symbol_id,
            "status": "instance",
            "instanceId": instanceId,
            "patterns": instances,
            "instances": instances,
        }

    filt = (status or "active").lower()
    if filt not in ("active", "closed", "all"):
        raise HTTPException(status_code=400, detail="status must be active, closed, or all")
    instances = c.pattern_service.list_for_symbol(
        symbol_id, status=filt, timeframe=timeframe
    )
    return {
        "symbolId": symbol_id,
        "status": filt,
        "patterns": instances,
        "instances": instances,  # FE may use either
    }


@router.get("/{symbol_id:path}/statistics")
def get_statistics(
    symbol_id: str,
    request: Request,
    _user: AuthUser,
    patternType: str | None = "breakout",
    timeframe: str | None = None,
):
    if symbol_id.endswith("/statistics"):
        symbol_id = symbol_id[: -len("/statistics")]
    c = request.app.state.container
    if not c.settings.pattern_enabled:
        raise HTTPException(status_code=503, detail="Pattern feature disabled")
    entry = c.watchlist_repo.find_by_symbol_id(symbol_id)
    if entry is None or not entry.active:
        raise HTTPException(status_code=404, detail=f"Symbol not on watchlist: {symbol_id}")
    if not timeframe:
        raise HTTPException(status_code=400, detail="timeframe is required")
    return c.pattern_service.statistics_for_symbol(
        symbol_id, pattern_type=patternType, timeframe=timeframe
    )

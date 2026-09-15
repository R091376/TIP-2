from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query, Request

from app.patterns.research_filters import today_ist
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


@router.get("/{symbol_id:path}/sr")
def get_daily_sr(
    symbol_id: str,
    request: Request,
    from_: date | None = Query(None, alias="from"),
    to: date | None = None,
):
    """Frozen Woodie ladders for the chart overlay. Does not recompute."""
    if symbol_id.endswith("/sr"):
        symbol_id = symbol_id[: -len("/sr")]
    c = request.app.state.container
    if not getattr(c.settings, "pattern_sr_enabled", True):
        raise HTTPException(status_code=503, detail="Woodie S/R is disabled")
    sr = getattr(c, "daily_sr_service", None)
    if sr is None:
        raise HTTPException(status_code=503, detail="Woodie S/R is not available")

    entry = c.watchlist_repo.find_by_symbol_id(symbol_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Symbol not on watchlist: {symbol_id}")
    if entry.bootstrap_status == SymbolBootstrapStatus.REMOVING or not entry.active:
        raise HTTPException(status_code=404, detail=f"Symbol not on watchlist: {symbol_id}")

    end = to or today_ist()
    start = from_ or (end - timedelta(days=90))
    if start > end:
        raise HTTPException(status_code=400, detail="from must be on or before to")
    max_days = int(getattr(c.settings, "research_stats_max_range_days", 180) or 180)
    if (end - start).days > max_days:
        start = end - timedelta(days=max_days)

    rows = sr.list_window(symbol_id, start, end)
    method = getattr(c.settings, "pattern_sr_method", None) or "woodie_open_v1"
    return {
        "symbolId": symbol_id,
        "method": method,
        "from": start.isoformat(),
        "to": end.isoformat(),
        "levels": [_sr_dto(day, lv, src) for day, lv, src in rows],
    }


def _sr_dto(session_date: date, lv, freeze_source: str) -> dict:
    return {
        "sessionDate": session_date.isoformat(),
        "method": getattr(lv, "method", None),
        "freezeSource": freeze_source,
        "pp": lv.pp,
        "r1": lv.r1,
        "s1": lv.s1,
        "r2": lv.r2,
        "s2": lv.s2,
        "r3": lv.r3,
        "s3": lv.s3,
        "r4": lv.r4,
        "s4": lv.s4,
        "todayOpen": lv.today_open,
        "prevHigh": lv.prev_high,
        "prevLow": lv.prev_low,
        "prevClose": lv.prev_close,
        "gap": lv.gap,
    }


@router.get("/{symbol_id:path}/patterns")
def get_patterns(
    symbol_id: str,
    request: Request,
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

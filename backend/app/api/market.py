from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from app.api.deps import AuthUser
from app.market.nse_clock import BootstrapStatus
from app.watchlist.models import SymbolBootstrapStatus

router = APIRouter(prefix="/api/market", tags=["market"])


def _candle_dto(c) -> dict:
    return {
        "time": c.time,
        "open": c.open,
        "high": c.high,
        "low": c.low,
        "close": c.close,
        "volume": c.volume,
    }


@router.get("/timeframes")
def get_timeframes(request: Request, _user: AuthUser):
    s = request.app.state.container.settings
    return {
        "defaultTimeframe": s.default_timeframe,
        "supported": s.supported_timeframes,
    }


@router.get("/symbol")
def get_symbol(request: Request, _user: AuthUser):
    c = request.app.state.container
    primary = c.watchlist_repo.find_primary()
    if primary:
        return {
            "symbol": primary.trading_symbol,
            "instrumentKey": primary.symbol_id,
            "defaultTimeframe": c.settings.default_timeframe,
        }
    return {
        "symbol": c.settings.default_symbol,
        "instrumentKey": c.settings.default_instrument_key,
        "defaultTimeframe": c.settings.default_timeframe,
    }


@router.get("/status")
def get_status(request: Request, _user: AuthUser):
    c = request.app.state.container
    status = c.market_status.get_bootstrap_status()
    error = c.market_status.get_bootstrap_error()

    primary = c.watchlist_repo.find_primary()
    if primary is not None and status == BootstrapStatus.READY:
        if primary.bootstrap_status == SymbolBootstrapStatus.FAILED:
            status = BootstrapStatus.FAILED
            error = primary.bootstrap_error or "Primary symbol bootstrap failed"
        elif primary.bootstrap_status == SymbolBootstrapStatus.PENDING:
            status = BootstrapStatus.PENDING
            error = None

    last = c.market_status.get_last_seeded_at()
    return {
        "marketPhase": c.market_status.get_market_phase().value,
        "bootstrapStatus": status.value if isinstance(status, BootstrapStatus) else status,
        "bootstrapError": error,
        "lastSeededAt": last.isoformat().replace("+00:00", "Z") if last else None,
        "liveFeedConnected": c.market_status.is_live_feed_connected(),
        "candleCount": c.market_status.get_seeded_candle_count(),
    }


@router.get("/candles")
def get_candles(
    request: Request,
    _user: AuthUser,
    from_: int | None = Query(None, alias="from"),
    to: int | None = None,
):
    c = request.app.state.container
    if c.market_status.get_bootstrap_status() == BootstrapStatus.FAILED:
        raise HTTPException(
            status_code=503,
            detail=c.market_status.get_bootstrap_error() or "Bootstrap failed",
        )

    primary = c.watchlist_repo.find_primary()
    if primary is not None:
        if primary.bootstrap_status == SymbolBootstrapStatus.FAILED:
            raise HTTPException(
                status_code=503,
                detail=primary.bootstrap_error or "Primary symbol bootstrap failed",
            )
        if primary.bootstrap_status == SymbolBootstrapStatus.PENDING:
            return []
        instrument_key = primary.symbol_id
    else:
        instrument_key = c.settings.default_instrument_key

    timeframe = c.settings.default_timeframe
    candles = c.candle_engine.get_all_candles(instrument_key, timeframe)
    out = []
    for candle in candles:
        if from_ is not None and candle.time < from_:
            continue
        if to is not None and candle.time > to:
            continue
        out.append(_candle_dto(candle))
    return out

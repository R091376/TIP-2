from __future__ import annotations

from fastapi import APIRouter, Query, Request

from app.api.deps import AuthUser

router = APIRouter(prefix="/api/instruments", tags=["instruments"])

DEFAULT_LIMIT = 15
MAX_LIMIT = 50


@router.get("/search")
def search(
    request: Request,
    _user: AuthUser,
    q: str = "",
    limit: int | None = Query(None),
):
    lim = DEFAULT_LIMIT if limit is None else min(MAX_LIMIT, max(1, limit))
    hits = request.app.state.container.instruments.search(q, lim)
    return [
        {
            "instrumentKey": h.instrument_key,
            "tradingSymbol": h.trading_symbol,
            "exchange": h.exchange,
            "segment": h.segment,
            "instrumentType": h.instrument_type,
            "displayName": h.display_name,
        }
        for h in hits
    ]

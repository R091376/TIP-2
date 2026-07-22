from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.api.deps import AuthUser

router = APIRouter(prefix="/api/pattern-statistics", tags=["patterns"])


@router.get("")
def bulk_statistics(
    request: Request,
    _user: AuthUser,
    patternType: str | None = None,
    timeframe: str | None = None,
):
    """
    Java parity (PatternStatisticsController):
    { minSampleSize, count, items: [ { status, symbolId, tradingSymbol, ... } ] }
    """
    c = request.app.state.container
    if not c.settings.pattern_enabled:
        raise HTTPException(status_code=503, detail="Pattern feature disabled")
    return c.pattern_service.bulk_statistics(
        pattern_type=patternType, timeframe=timeframe
    )

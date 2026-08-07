from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.api.deps import AdminUser, AuthUser

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


@router.get("/query")
def research_statistics(
    request: Request,
    _admin: AdminUser,
    symbolId: str | None = None,
    patternType: str | None = None,
    timeframe: str | None = None,
    direction: str | None = None,
    flagConfirmed: str | None = None,
    flagRetested: str | None = None,
    flagStrengthened: str | None = None,
    volumeOkAtDetect: str | None = None,
    confirmationMode: str | None = None,
    detectTimeIstStart: str | None = None,
    detectTimeIstEnd: str | None = None,
    detectedFrom: str | None = None,
    detectedTo: str | None = None,
    outcome: str | None = None,
    resolvedOnly: str | None = None,
    excludeReasons: str | None = None,
    includeReasons: str | None = None,
    minPlannedRr: str | None = None,
    minRiskR: str | None = None,
    maxRiskR: str | None = None,
    requireValidRails: str | None = None,
    detectorVersion: str | None = None,
    groupBy: str | None = None,
    minSampleSize: str | None = None,
    limitGroups: str | None = None,
):
    """
    Research / composable stack filters — query-time aggregation.
    ADMIN only. Requires Postgres journal.

    Rails geometry filters (ATR units from planned entry/stop/target):
    ``minPlannedRr``, ``minRiskR``, ``maxRiskR`` each imply valid rails.
    """
    c = request.app.state.container
    if not c.settings.pattern_enabled:
        raise HTTPException(status_code=503, detail="Pattern feature disabled")
    if not getattr(c.settings, "pattern_research_stats_enabled", True):
        raise HTTPException(status_code=503, detail="Research stats disabled")

    raw = {
        "symbolId": symbolId,
        "patternType": patternType,
        "timeframe": timeframe,
        "direction": direction,
        "flagConfirmed": flagConfirmed,
        "flagRetested": flagRetested,
        "flagStrengthened": flagStrengthened,
        "volumeOkAtDetect": volumeOkAtDetect,
        "confirmationMode": confirmationMode,
        "detectTimeIstStart": detectTimeIstStart,
        "detectTimeIstEnd": detectTimeIstEnd,
        "detectedFrom": detectedFrom,
        "detectedTo": detectedTo,
        "outcome": outcome,
        "resolvedOnly": resolvedOnly,
        "excludeReasons": excludeReasons,
        "includeReasons": includeReasons,
        "minPlannedRr": minPlannedRr,
        "minRiskR": minRiskR,
        "maxRiskR": maxRiskR,
        "requireValidRails": requireValidRails,
        "detectorVersion": detectorVersion,
        "groupBy": groupBy,
        "minSampleSize": minSampleSize,
        "limitGroups": limitGroups,
    }
    try:
        return c.pattern_service.query_statistics(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=503, detail="Research query timed out") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

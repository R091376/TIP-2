"""Session-day pattern alerts (persisted journal → FE feed after refresh)."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Query, Request
from zoneinfo import ZoneInfo

router = APIRouter(prefix="/api/pattern-alerts", tags=["patterns"])
_IST = ZoneInfo("Asia/Kolkata")


@router.get("")
def list_pattern_alerts(
    request: Request,
    day: str | None = Query(
        None,
        description="IST calendar day YYYY-MM-DD (default: today Asia/Kolkata)",
    ),
    limit: int = Query(500, ge=1, le=2000),
    symbolId: str | None = None,
    timeframe: str | None = None,
    includeExpired: bool = Query(
        True,
        description="Include stage=expired events (session-close / max-duration). Default true.",
    ),
):
    """
    Pattern stage events for the trading calendar day (IST).

    Includes **expired** stages by default so the FE can show full day lifecycle
    (muted styling for expired). Pass includeExpired=false for actionable-only.
    """
    c = request.app.state.container
    if not c.settings.pattern_enabled:
        raise HTTPException(status_code=503, detail="Pattern feature disabled")

    journal = c.pattern_journal
    if journal is None or not getattr(journal, "is_active", lambda: False)():
        return {
            "day": _today_ist_str(),
            "count": 0,
            "items": [],
            "includeExpired": includeExpired,
        }

    parsed_day: date | None = None
    if day and day.strip():
        try:
            parsed_day = date.fromisoformat(day.strip())
        except ValueError as e:
            raise HTTPException(
                status_code=400, detail="day must be YYYY-MM-DD"
            ) from e

    if not hasattr(journal, "list_session_day_alerts"):
        return {"day": _today_ist_str(), "count": 0, "items": [], "includeExpired": includeExpired}

    items = journal.list_session_day_alerts(
        day=parsed_day,
        limit=limit,
        symbol_id=symbolId,
        timeframe=timeframe,
        include_expired=includeExpired,
    )
    day_label = (
        parsed_day.isoformat()
        if parsed_day
        else datetime.now(tz=_IST).date().isoformat()
    )
    return {
        "day": day_label,
        "count": len(items),
        "items": items,
        "includeExpired": includeExpired,
    }


def _today_ist_str() -> str:
    return datetime.now(tz=_IST).date().isoformat()

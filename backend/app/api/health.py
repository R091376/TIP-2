from __future__ import annotations

from fastapi import APIRouter, Query, Request
from sqlalchemy import text

router = APIRouter(tags=["health"])


def _database_status(container) -> tuple[str, str | None]:
    """Return (database status, optional error).

    UP      — SELECT 1 succeeded against Postgres
    DOWN    — expected Postgres but ping failed / no session factory
    SKIPPED — memory profile (no Postgres required)
    """
    settings = container.settings
    if settings.is_memory_profile or settings.watchlist_store == "memory":
        return "SKIPPED", None

    session_factory = getattr(getattr(container, "user_service", None), "_sf", None)
    if session_factory is None:
        journal = getattr(container, "pattern_journal", None)
        session_factory = getattr(journal, "_sf", None)

    if session_factory is None:
        return "DOWN", "Postgres session factory not available"

    try:
        with session_factory() as session:
            session.execute(text("SELECT 1"))
        return "UP", None
    except Exception as e:
        return "DOWN", str(e)[:200]


@router.get("/api/health")
def health(
    request: Request,
    detail: bool = Query(
        default=False,
        description="Include journal counts and extra diagnostics (heavier).",
    ),
):
    """Liveness + readiness fields for deploy / FE startup gate.

    Always returns HTTP 200 when the process is serving traffic so Render
    liveness checks stay green during brief DB blips. Callers that need
    readiness (FE startup gate) should inspect ``database`` in the body.

    Default body is cheap (SELECT 1 only). Pass ``?detail=1`` for journal counts.
    """
    body: dict = {"status": "UP", "database": "DOWN"}
    container = getattr(request.app.state, "container", None)
    if container is None:
        body["database"] = "DOWN"
        body["databaseError"] = "Container not initialized"
        return body

    try:
        db_status, db_error = _database_status(container)
        body["database"] = db_status
        if db_error:
            body["databaseError"] = db_error
    except Exception as e:
        body["database"] = "DOWN"
        body["databaseError"] = str(e)[:200]

    try:
        body["marketPhase"] = container.market_status.get_market_phase().value
        body["liveFeedConnected"] = container.market_status.is_live_feed_connected()
        body["bootstrapStatus"] = container.market_status.get_bootstrap_status().value
    except Exception:
        pass

    try:
        # redacted DB host for verifying Render points at Neon
        url = container.settings.sqlalchemy_url or ""
        if "@" in url:
            body["databaseHost"] = url.split("@", 1)[-1].split("?", 1)[0]
        else:
            body["databaseHost"] = "(unset or local)"
    except Exception:
        pass

    if not detail:
        return body

    # ── Optional heavy diagnostics ─────────────────────────────────────
    journal = getattr(container, "pattern_journal", None)
    if journal is not None:
        body["journal"] = type(journal).__name__
        try:
            if hasattr(journal, "list_session_day_alerts"):
                items = journal.list_session_day_alerts(limit=1, include_expired=False)
                body["dayAlertsSample"] = len(items)
            if hasattr(journal, "_sf") and journal._sf is not None:
                with journal._sf() as s:
                    body["patternEventCount"] = int(
                        s.execute(text("SELECT COUNT(*) FROM pattern_events")).scalar() or 0
                    )
                    body["patternInstanceCount"] = int(
                        s.execute(text("SELECT COUNT(*) FROM pattern_instances")).scalar() or 0
                    )
        except Exception as e:
            body["journalError"] = str(e)[:200]

    return body

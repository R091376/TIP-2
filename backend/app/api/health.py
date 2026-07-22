from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health(request: Request):
    """Liveness + lightweight diagnostics for deploy debugging."""
    body: dict = {"status": "UP"}
    container = getattr(request.app.state, "container", None)
    if container is None:
        return body

    try:
        body["marketPhase"] = container.market_status.get_market_phase().value
        body["liveFeedConnected"] = container.market_status.is_live_feed_connected()
        body["bootstrapStatus"] = container.market_status.get_bootstrap_status().value
    except Exception:
        pass

    journal = getattr(container, "pattern_journal", None)
    if journal is not None:
        body["journal"] = type(journal).__name__
        try:
            if hasattr(journal, "list_session_day_alerts"):
                items = journal.list_session_day_alerts(limit=1, include_expired=False)
                # cheap count via raw session if postgres
                body["dayAlertsSample"] = len(items)
            if hasattr(journal, "_sf") and journal._sf is not None:
                from sqlalchemy import text

                with journal._sf() as s:
                    body["patternEventCount"] = int(
                        s.execute(text("SELECT COUNT(*) FROM pattern_events")).scalar() or 0
                    )
                    body["patternInstanceCount"] = int(
                        s.execute(text("SELECT COUNT(*) FROM pattern_instances")).scalar() or 0
                    )
        except Exception as e:
            body["journalError"] = str(e)[:200]

    try:
        # redacted DB host for verifying Render points at Neon
        url = container.settings.sqlalchemy_url or ""
        if "@" in url:
            body["databaseHost"] = url.split("@", 1)[-1].split("?", 1)[0]
        else:
            body["databaseHost"] = "(unset or local)"
    except Exception:
        pass

    return body

from __future__ import annotations

from fastapi import APIRouter, Query, Request
from sqlalchemy import text

router = APIRouter(tags=["health"])


def _database_status(container) -> tuple[str, str | None]:
    """Return (database status, optional error).

    UP      — SELECT 1 succeeded against Postgres
    DOWN    — expected Postgres but ping failed / no usable connection
    SKIPPED — memory profile (no Postgres required)

    Always runs a real ``SELECT 1`` when Postgres is expected, either via the
    live session factory or a one-shot engine when init fell back to memory.
    """
    settings = container.settings
    if settings.is_memory_profile or settings.watchlist_store == "memory":
        return "SKIPPED", None

    # Prefer live pool used by the app
    session_factory = getattr(container, "session_factory", None)
    if session_factory is None:
        session_factory = getattr(getattr(container, "user_service", None), "_sf", None)
    if session_factory is None:
        journal = getattr(container, "pattern_journal", None)
        session_factory = getattr(journal, "_sf", None)

    if session_factory is not None:
        try:
            with session_factory() as session:
                session.execute(text("SELECT 1"))
            return "UP", None
        except Exception as e:
            return "DOWN", str(e)[:200]

    # No pool: init failed and we fell back to memory while still configured
    # for postgres — try a one-shot connect so the error is actionable.
    init_err = getattr(container, "postgres_init_error", None)
    try:
        from app.db.session import create_engine_and_session

        url = settings.sqlalchemy_url
        engine, _ = create_engine_and_session(url)
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            # Connect works now, but app is still on memory fallback until restart
            msg = (
                "SELECT 1 ok, but app has no session factory "
                "(Postgres init failed earlier; restart API after fixing). "
            )
            if init_err:
                msg += f"Init error: {init_err}"
            return "DOWN", msg[:300]
        finally:
            engine.dispose()
    except Exception as e:
        detail = str(e)[:200]
        if init_err:
            return "DOWN", f"Init failed: {init_err} | ping: {detail}"[:300]
        return "DOWN", f"Postgres session factory missing; ping failed: {detail}"[:300]


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

    # Diagnostics so FE "Postgres spinning" can be explained without log access
    try:
        body["postgresConfigured"] = not (
            container.settings.is_memory_profile
            or container.settings.watchlist_store == "memory"
        )
        body["hasSessionFactory"] = getattr(container, "session_factory", None) is not None
        journal = getattr(container, "pattern_journal", None)
        if journal is not None:
            body["journal"] = type(journal).__name__
        init_err = getattr(container, "postgres_init_error", None)
        if init_err:
            body["postgresInitError"] = init_err
    except Exception:
        pass

    try:
        body["marketPhase"] = container.market_status.get_market_phase().value
        body["liveFeedConnected"] = container.market_status.is_live_feed_connected()
        body["bootstrapStatus"] = container.market_status.get_bootstrap_status().value
        feed = getattr(container, "feed_client", None)
        if feed is not None and hasattr(feed, "diagnostics"):
            body["liveFeed"] = feed.diagnostics()
    except Exception:
        pass

    try:
        # redacted DB host for verifying Render points at Neon
        url = container.settings.sqlalchemy_url or ""
        if "@" in url:
            body["databaseHost"] = url.split("@", 1)[-1].split("?", 1)[0]
        else:
            body["databaseHost"] = "(unset or local)"
        # scheme only — helps spot missing +psycopg without leaking secrets
        if "://" in url:
            body["databaseUrlScheme"] = url.split("://", 1)[0]
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
                items = journal.list_session_day_alerts(limit=5, include_expired=True)
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

from __future__ import annotations

import logging
import subprocess
import sys
import threading
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import require_admin
from app.backtest.engine import execute_run
from app.backtest.spec import PatternSpec

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backtests", tags=["backtests"])


def _jobs(request: Request):
    jobs = getattr(request.app.state.container, "backtest_jobs", None)
    if jobs is None:
        raise HTTPException(status_code=503, detail="Backtest store not available")
    return jobs


def _enabled(request: Request) -> None:
    settings = request.app.state.container.settings
    if not getattr(settings, "backtest_enabled", True):
        raise HTTPException(status_code=503, detail="Backtest is disabled")


@router.post("")
def create_run(body: dict, request: Request, user=Depends(require_admin)):
    _enabled(request)
    try:
        spec = PatternSpec.from_dict(body if isinstance(body, dict) else {})
    except (TypeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    jobs = _jobs(request)
    created_by = str((user or {}).get("username") or (user or {}).get("id") or "admin")
    row = jobs.create(created_by=created_by, spec=spec)
    _kick(request, row["id"])
    return row


@router.get("")
def list_runs(request: Request, user=Depends(require_admin), limit: int = 50):
    _enabled(request)
    return {"items": _jobs(request).list_recent(limit=min(200, max(1, limit)))}


@router.delete("")
def clear_runs(request: Request, user=Depends(require_admin)):
    """Delete all backtest runs and trades. Does not touch market_candles."""
    _enabled(request)
    n = _jobs(request).clear_all()
    return {"deleted": n}


@router.get("/{run_id}")
def get_run(run_id: str, request: Request, user=Depends(require_admin)):
    _enabled(request)
    jobs = _jobs(request)
    row = jobs.get(run_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")
    row = dict(row)
    row["trades"] = jobs.trades(run_id, limit=500)
    return row


def _kick(request: Request, run_id: str) -> None:
    container = request.app.state.container
    settings = container.settings
    # Memory / tests: run in a daemon thread (no live feed in this path).
    if settings.is_memory_profile or container.session_factory is None:
        t = threading.Thread(
            target=_run_inprocess,
            args=(container, run_id),
            name=f"backtest-{run_id[:8]}",
            daemon=True,
        )
        t.start()
        return
    backend_root = Path(__file__).resolve().parents[2]
    try:
        subprocess.Popen(
            [sys.executable, "-m", "app.backtest.worker", "--run-id", str(run_id)],
            cwd=str(backend_root),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        logger.exception("Failed to spawn backtest worker; falling back in-process")
        t = threading.Thread(
            target=_run_inprocess,
            args=(container, run_id),
            name=f"backtest-{run_id[:8]}",
            daemon=True,
        )
        t.start()


def _run_inprocess(container, run_id: str) -> None:
    try:
        execute_run(
            run_id,
            container.backtest_jobs,
            container.settings,
            container.candle_warehouse,
            getattr(container, "candle_ingest", None),
            getattr(container, "instruments", None),
        )
    except Exception:
        logger.exception("In-process backtest %s failed", run_id)

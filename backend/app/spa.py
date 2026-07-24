"""
Serve the Vite SPA from the same origin as the API (first-party session cookies).

Cross-site cookies between tip2-web.onrender.com and tip2-api.onrender.com are
third-party and get blocked on many mobile browsers even with SameSite=None.
Serving the built frontend from the API host makes TIPSESSION first-party.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger("tip2")

# backend/static  (filled at Render build from frontend/dist)
DEFAULT_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

# Paths handled by FastAPI / Starlette — never SPA-fallback these.
_API_PREFIXES = (
    "api/",
    "api",
    "ws/",
    "ws",
    "docs",
    "redoc",
    "openapi.json",
    "openapi",
)


def resolve_static_dir() -> Path | None:
    """Return the SPA directory when index.html is present."""
    candidate = DEFAULT_STATIC_DIR
    if (candidate / "index.html").is_file():
        return candidate
    return None


def mount_spa(app: FastAPI, static_dir: Path | None = None) -> bool:
    """
    Mount /assets and SPA fallback for client routes.

    Returns True when SPA files were found and mounted.
    Call after all API routers are registered.
    """
    root = static_dir if static_dir is not None else resolve_static_dir()
    if root is None:
        logger.info("SPA not found at %s — API-only mode", DEFAULT_STATIC_DIR)
        return False

    assets = root / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="spa-assets")

    index = root / "index.html"

    @app.get("/")
    def spa_index():
        return FileResponse(index, media_type="text/html")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        # Never hijack API / docs / websocket paths (404 if no API route matched).
        if full_path.startswith(_API_PREFIXES) or full_path in _API_PREFIXES:
            raise HTTPException(status_code=404, detail="Not Found")

        # Safe file serve under static root only.
        target = (root / full_path).resolve()
        try:
            target.relative_to(root.resolve())
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Not Found") from exc

        if target.is_file():
            return FileResponse(target)

        # Client-side router (React Router) shell
        return FileResponse(index, media_type="text/html")

    logger.info("SPA mounted from %s (same-origin first-party cookies)", root)
    return True

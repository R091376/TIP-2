"""
FastAPI application entrypoint.

Run:
  cd backend
  set TIP_WATCHLIST_STORE=memory
  uvicorn app.main:app --host 0.0.0.0 --port 8080
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    admin_users,
    auth,
    backtests,
    health,
    instruments,
    market,
    paper,
    pattern_alerts,
    pattern_statistics,
    symbols,
    watchlist,
)
from app.api.websocket import live as live_ws
from app.config import get_settings
from app.container import build_container

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("tip2")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    container = build_container(settings)
    app.state.container = container
    loop = asyncio.get_running_loop()
    container.startup(loop)
    logger.info("TIP-2 ready on port %s", settings.server_port)
    yield
    container.shutdown()
    logger.info("TIP-2 shutdown complete")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Trading Intelligence Platform (TIP-2)",
        version="0.1.0",
        lifespan=lifespan,
    )

    origins = settings.cors_origins_list() or ["http://localhost:5173"]
    logger.info(
        "CORS allow_origins=%s auth=jwt expire_hours=%s",
        origins,
        settings.jwt_expire_hours,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        # JWT is sent via Authorization header (not cookies); credentials not required.
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=3600,
    )

    @app.get("/")
    def root():
        """Avoid bare 404 on the API host (browsers often open /)."""
        return {
            "service": "tip2-api",
            "status": "UP",
            "health": "/api/health",
            "docs": "/docs",
            "auth": "Bearer JWT (8h access token)",
        }

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(admin_users.router)
    app.include_router(market.router)
    app.include_router(symbols.router)
    app.include_router(watchlist.router)
    app.include_router(instruments.router)
    app.include_router(pattern_statistics.router)
    app.include_router(pattern_alerts.router)
    app.include_router(backtests.router)
    if settings.paper_enabled:
        app.include_router(paper.router)
    app.include_router(live_ws.router)

    return app


app = create_app()

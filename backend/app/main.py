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
from starlette.middleware.sessions import SessionMiddleware

from app.api import admin_users, auth, health, instruments, market, pattern_statistics, symbols, watchlist
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

    origins = [o.strip() for o in settings.cors_allowed_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins or ["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        max_age=3600,
    )
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        session_cookie="TIPSESSION",
        same_site="lax",
        https_only=False,
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(admin_users.router)
    app.include_router(market.router)
    app.include_router(symbols.router)
    app.include_router(watchlist.router)
    app.include_router(instruments.router)
    app.include_router(pattern_statistics.router)
    app.include_router(live_ws.router)

    return app


app = create_app()

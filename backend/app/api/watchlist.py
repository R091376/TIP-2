from __future__ import annotations

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from app.api.deps import AdminUser, AuthUser

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class AddWatchlistRequest(BaseModel):
    symbol: str | None = None
    instrumentKey: str | None = None


@router.get("")
def list_watchlist(request: Request, _user: AuthUser):
    entries = request.app.state.container.watchlist_service.list_active()
    return [e.to_dict() for e in entries]


@router.post("")
def add_watchlist(body: AddWatchlistRequest, request: Request, _admin: AdminUser):
    entry = request.app.state.container.watchlist_service.add(body.symbol, body.instrumentKey)
    return entry.to_dict()


@router.delete("/{symbol_id:path}", status_code=204)
def remove_watchlist(symbol_id: str, request: Request, _admin: AdminUser):
    request.app.state.container.watchlist_service.remove(symbol_id)
    return Response(status_code=204)

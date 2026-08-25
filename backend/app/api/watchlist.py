from __future__ import annotations

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from app.api.deps import AdminUser, AuthUser
from app.market.session_policy import session_payload

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class AddWatchlistRequest(BaseModel):
    symbol: str | None = None
    instrumentKey: str | None = None


def _entry_dto(e, cas_enabled: bool) -> dict:
    d = e.to_dict()
    d.update(
        session_payload(
            e.trading_symbol,
            segment=e.segment,
            instrument_type=e.instrument_type,
            cas_enabled=cas_enabled,
        )
    )
    return d


@router.get("")
def list_watchlist(request: Request, _user: AuthUser):
    c = request.app.state.container
    cas_on = bool(getattr(getattr(c, "settings", None), "cas_session_enabled", True))
    entries = c.watchlist_service.list_active()
    return [_entry_dto(e, cas_on) for e in entries]


@router.post("")
def add_watchlist(body: AddWatchlistRequest, request: Request, _admin: AdminUser):
    c = request.app.state.container
    cas_on = bool(getattr(getattr(c, "settings", None), "cas_session_enabled", True))
    entry = c.watchlist_service.add(body.symbol, body.instrumentKey)
    return _entry_dto(entry, cas_on)


@router.delete("/{symbol_id:path}", status_code=204)
def remove_watchlist(symbol_id: str, request: Request, _admin: AdminUser):
    request.app.state.container.watchlist_service.remove(symbol_id)
    return Response(status_code=204)

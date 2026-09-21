"""REST API for manual paper trading."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.api.deps import AuthUser

router = APIRouter(prefix="/api/paper", tags=["paper"])


def _svc(request: Request):
    svc = getattr(request.app.state.container, "paper_service", None)
    if svc is None:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=503,
            detail={"code": "PAPER_DISABLED", "message": "Paper trading not available"},
        )
    return svc


def _uid(user: dict) -> UUID:
    return UUID(str(user["id"]))


def _trading_enabled(user: dict) -> bool:
    return bool(user.get("tradingEnabled", True))


class PlaceOrderBody(BaseModel):
    instrumentKey: str
    side: str
    orderType: str
    product: str = "MIS"
    qty: int = Field(ge=1)
    price: float | None = None
    triggerPrice: float | None = None
    closeLotId: str | None = None
    clientOrderId: str | None = None


class ModifyOrderBody(BaseModel):
    qty: int | None = Field(default=None, ge=1)
    price: float | None = None
    triggerPrice: float | None = None


class ChargesPreviewBody(BaseModel):
    instrumentKey: str
    side: str
    orderType: str
    product: str = "MIS"
    qty: int = Field(ge=1)
    price: float | None = None
    closeLotId: str | None = None


@router.get("/account")
def account(request: Request, user: AuthUser):
    return _svc(request).account_snapshot(_uid(user))


@router.get("/orders")
def list_orders(request: Request, user: AuthUser, status: str | None = None, limit: int = 100):
    return _svc(request).list_orders(_uid(user), status=status, limit=min(limit, 500))


@router.get("/orders/{order_id}")
def get_order(order_id: UUID, request: Request, user: AuthUser):
    return _svc(request).get_order(_uid(user), order_id)


@router.post("/orders")
def place_order(body: PlaceOrderBody, request: Request, user: AuthUser):
    return _svc(request).place_order(
        _uid(user),
        instrument_key=body.instrumentKey,
        side=body.side,
        order_type=body.orderType,
        product=body.product,
        qty=body.qty,
        price=body.price,
        trigger_price=body.triggerPrice,
        close_lot_id=body.closeLotId,
        client_order_id=body.clientOrderId,
        trading_enabled=_trading_enabled(user),
    )


@router.delete("/orders/{order_id}")
def cancel_order(order_id: UUID, request: Request, user: AuthUser):
    return _svc(request).cancel_order(_uid(user), order_id)


@router.patch("/orders/{order_id}")
def modify_order(order_id: UUID, body: ModifyOrderBody, request: Request, user: AuthUser):
    return _svc(request).modify_order(
        _uid(user),
        order_id,
        qty=body.qty,
        price=body.price,
        trigger_price=body.triggerPrice,
    )


@router.get("/positions")
def list_positions(request: Request, user: AuthUser, openOnly: bool = True):
    return _svc(request).list_positions(_uid(user), open_only=openOnly)


@router.get("/fills")
def list_fills(request: Request, user: AuthUser, limit: int = 100):
    return _svc(request).list_fills(_uid(user), limit=min(limit, 500))


@router.get("/ledger")
def list_ledger(request: Request, user: AuthUser, limit: int = 100):
    return _svc(request).list_ledger(_uid(user), limit=min(limit, 500))


@router.post("/charges/preview")
def preview_charges(body: ChargesPreviewBody, request: Request, user: AuthUser):
    """Read-only charge estimate. Does not require tradingEnabled; no cash movement."""
    return _svc(request).preview_charges(
        _uid(user),
        instrument_key=body.instrumentKey,
        side=body.side,
        order_type=body.orderType,
        product=body.product,
        qty=body.qty,
        price=body.price,
        close_lot_id=body.closeLotId,
    )


@router.get("/ltp/{instrument_key:path}")
def get_ltp(instrument_key: str, request: Request, user: AuthUser):
    svc = _svc(request)
    q = svc.last_price.get(instrument_key)
    if q is None:
        return {"instrumentKey": instrument_key, "ltp": None, "timestampMs": None}
    return {
        "instrumentKey": instrument_key,
        "ltp": float(q.price),
        "timestampMs": q.timestamp_ms,
    }

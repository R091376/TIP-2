from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.api.deps import AdminUser
from app.user.models import UserRole

router = APIRouter(prefix="/api/admin/users", tags=["admin"])


class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str | None = None
    displayName: str | None = None
    seedCash: float | None = None


class UpdateUserRequest(BaseModel):
    displayName: str | None = None
    role: str | None = None
    tradingEnabled: bool | None = None
    active: bool | None = None


class SetPasswordRequest(BaseModel):
    password: str


class CashAmountRequest(BaseModel):
    amount: float | None = None


class TradingRequest(BaseModel):
    enabled: bool = True


@router.get("")
def list_users(request: Request, _admin: AdminUser):
    users = request.app.state.container.user_service.list_users()
    return [u.to_dto() for u in users]


@router.get("/{user_id}")
def get_user(user_id: UUID, request: Request, _admin: AdminUser):
    return request.app.state.container.user_service.require_by_id(user_id).to_dto()


@router.post("")
def create_user(body: CreateUserRequest, request: Request, _admin: AdminUser):
    role = UserRole(body.role) if body.role else UserRole.USER
    seed = Decimal(str(body.seedCash)) if body.seedCash is not None else None
    user = request.app.state.container.user_service.create_user(
        username=body.username,
        password=body.password,
        role=role,
        display_name=body.displayName,
        seed_cash=seed,
    )
    return user.to_dto()


@router.put("/{user_id}")
def update_user(user_id: UUID, body: UpdateUserRequest, request: Request, _admin: AdminUser):
    role = UserRole(body.role) if body.role else None
    user = request.app.state.container.user_service.update_user(
        user_id,
        display_name=body.displayName,
        role=role,
        trading_enabled=body.tradingEnabled,
        active=body.active,
    )
    return user.to_dto()


@router.post("/{user_id}/password")
def set_password(user_id: UUID, body: SetPasswordRequest, request: Request, _admin: AdminUser):
    request.app.state.container.user_service.set_password(user_id, body.password)
    return {"status": "ok"}


@router.post("/{user_id}/seed-cash")
def seed_cash(user_id: UUID, body: CashAmountRequest, request: Request, _admin: AdminUser):
    amount = Decimal(str(body.amount)) if body.amount is not None else None
    return request.app.state.container.user_service.seed_cash(user_id, amount).to_dto()


@router.post("/{user_id}/reset")
def reset_user(
    user_id: UUID,
    request: Request,
    _admin: AdminUser,
    body: CashAmountRequest | None = None,
):
    amount = Decimal(str(body.amount)) if body and body.amount is not None else None
    paper = getattr(request.app.state.container, "paper_service", None)
    if paper is not None:
        try:
            paper.wipe_user(user_id, close_price_policy="LTP_ELSE_ENTRY")
        except Exception:
            # wipe best-effort; cash reset still proceeds
            pass
    user = request.app.state.container.user_service.reset_user(user_id, amount)
    if paper is not None:
        try:
            paper.sync_user_cash(user_id, user.cash_balance)
        except Exception:
            pass
    return user.to_dto()


@router.post("/{user_id}/trading")
def set_trading(user_id: UUID, body: TradingRequest, request: Request, _admin: AdminUser):
    return request.app.state.container.user_service.set_trading(user_id, body.enabled).to_dto()

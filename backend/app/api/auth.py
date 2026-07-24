from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.api.deps import AuthUser
from app.auth.jwt_tokens import issue_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


def _token_response(settings, user: dict) -> dict:
    token, expires_in = issue_access_token(
        secret=settings.jwt_signing_secret(),
        user_id=str(user.get("id") or user.get("username") or "user"),
        username=str(user.get("username") or ""),
        role=str(user.get("role") or "USER"),
        expire_hours=settings.jwt_expire_hours,
    )
    return {
        "accessToken": token,
        "tokenType": "Bearer",
        "expiresIn": expires_in,
        "user": user,
    }


@router.post("/login")
def login(body: LoginRequest, request: Request):
    container = request.app.state.container
    settings = container.settings
    if settings.is_memory_profile:
        # Open profile: accept any login as synthetic admin for FE continuity
        user = {
            "id": "00000000-0000-0000-0000-000000000001",
            "username": body.username or "admin",
            "displayName": "Memory Admin",
            "role": "ADMIN",
            "cashBalance": 100000.0,
            "tradingEnabled": True,
            "active": True,
            "createdAt": "2020-01-01T00:00:00Z",
            "updatedAt": "2020-01-01T00:00:00Z",
        }
        return _token_response(settings, user)

    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="username and password required")
    app_user = container.user_service.authenticate(body.username.strip(), body.password)
    if app_user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    dto = app_user.to_dto()
    return _token_response(settings, dto)


@router.post("/logout")
def logout():
    """Stateless JWT: client discards the token. Always 200."""
    return {"status": "ok"}


@router.get("/me")
def me(request: Request, user: AuthUser):
    container = request.app.state.container
    if container.settings.is_memory_profile:
        return user if user.get("username") else {
            "id": user.get("id"),
            "username": user.get("username") or "memory",
            "role": user.get("role") or "ADMIN",
            "displayName": "Memory Admin",
            "cashBalance": 100000.0,
            "tradingEnabled": True,
            "active": True,
        }

    # AuthUser already refreshed from store when possible; ensure full DTO.
    username = user.get("username", "")
    if user.get("displayName") is not None or user.get("cashBalance") is not None:
        return user
    app_user = container.user_service.find_by_username(username)
    if app_user is None:
        raise HTTPException(status_code=401, detail="Not logged in")
    return app_user.to_dto()

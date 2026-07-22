from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginRequest, request: Request):
    container = request.app.state.container
    if container.settings.is_memory_profile:
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
        request.session["user"] = user
        return user

    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="username and password required")
    app_user = container.user_service.authenticate(body.username.strip(), body.password)
    if app_user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    dto = app_user.to_dto()
    request.session["user"] = dto
    return dto


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return {"status": "ok"}


@router.get("/me")
def me(request: Request):
    container = request.app.state.container
    if container.settings.is_memory_profile:
        user = request.session.get("user")
        if user:
            return user
        raise HTTPException(status_code=401, detail="Not logged in")
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    # refresh from store
    app_user = container.user_service.find_by_username(user.get("username", ""))
    if app_user is None:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Not logged in")
    return app_user.to_dto()

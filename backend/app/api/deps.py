from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request

from app.config import Settings, get_settings


def get_app_state(request: Request):
    return request.app.state.container


def get_settings_dep() -> Settings:
    return get_settings()


def current_user(request: Request):
    settings: Settings = request.app.state.container.settings
    if settings.is_memory_profile:
        return {"username": "memory", "role": "ADMIN"}
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Not logged in")
    return user


def require_admin(user=Depends(current_user)):
    settings = get_settings()
    if settings.is_memory_profile:
        return user
    if user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


AuthUser = Annotated[dict, Depends(current_user)]
AdminUser = Annotated[dict, Depends(require_admin)]

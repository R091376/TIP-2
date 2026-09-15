from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from jwt.exceptions import InvalidTokenError

from app.auth.jwt_tokens import bearer_token_from_header, decode_access_token
from app.config import get_settings


def current_user(request: Request):
    """Resolve caller from Authorization: Bearer <JWT>.

    Public market-desk GETs (watchlist list, market, symbols candles/sr/patterns/
    statistics, pattern-alerts, bulk pattern-statistics) do **not** use this
    dependency. Keep AuthUser on /api/auth/me, /api/paper/*, instrument search.
    Keep AdminUser on /api/admin/users, watchlist mutate, research query.
    """
    settings = request.app.state.container.settings
    if settings.is_memory_profile:
        # Open profile: accept missing token as synthetic admin for local/tests.
        auth = request.headers.get("Authorization")
        token = bearer_token_from_header(auth)
        if not token:
            return {
                "id": "00000000-0000-0000-0000-000000000001",
                "username": "memory",
                "displayName": "Memory Admin",
                "role": "ADMIN",
                "cashBalance": 100000.0,
                "tradingEnabled": True,
                "active": True,
            }
        try:
            claims = decode_access_token(token, settings.jwt_signing_secret())
        except InvalidTokenError as exc:
            raise HTTPException(status_code=401, detail="Not logged in") from exc
        return {
            "id": str(claims.get("sub") or ""),
            "username": str(claims.get("username") or "memory"),
            "displayName": "Memory Admin",
            "role": str(claims.get("role") or "ADMIN"),
            "cashBalance": 100000.0,
            "tradingEnabled": True,
            "active": True,
        }

    token = bearer_token_from_header(request.headers.get("Authorization"))
    if not token:
        raise HTTPException(status_code=401, detail="Not logged in")
    try:
        claims = decode_access_token(token, settings.jwt_signing_secret())
    except InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Not logged in") from exc

    username = str(claims.get("username") or "").strip()
    if not username:
        raise HTTPException(status_code=401, detail="Not logged in")

    container = request.app.state.container
    user_service = getattr(container, "user_service", None)
    if user_service is not None:
        app_user = user_service.find_by_username(username)
        if app_user is None or not getattr(app_user, "active", True):
            raise HTTPException(status_code=401, detail="Not logged in")
        return app_user.to_dto()

    return {
        "id": str(claims.get("sub") or ""),
        "username": username,
        "role": str(claims.get("role") or "USER"),
    }


def require_admin(user=Depends(current_user)):
    settings = get_settings()
    if settings.is_memory_profile:
        return user
    if user.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


AuthUser = Annotated[dict, Depends(current_user)]
AdminUser = Annotated[dict, Depends(require_admin)]

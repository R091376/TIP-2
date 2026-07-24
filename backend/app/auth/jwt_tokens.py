"""HS256 JWT access tokens (8h default). No refresh tokens."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from jwt.exceptions import InvalidTokenError

ALGORITHM = "HS256"
DEFAULT_EXPIRE_HOURS = 8


def issue_access_token(
    *,
    secret: str,
    user_id: str,
    username: str,
    role: str,
    expire_hours: int = DEFAULT_EXPIRE_HOURS,
) -> tuple[str, int]:
    """
    Return (token, expires_in_seconds).
    """
    hours = max(1, int(expire_hours or DEFAULT_EXPIRE_HOURS))
    now = datetime.now(timezone.utc)
    exp = now + timedelta(hours=hours)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    token = jwt.encode(payload, secret, algorithm=ALGORITHM)
    # PyJWT 2.x returns str
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    expires_in = int((exp - now).total_seconds())
    return token, expires_in


def decode_access_token(token: str, secret: str) -> dict[str, Any]:
    """
    Verify signature + exp. Raises InvalidTokenError (or subclass) on failure.
    """
    return jwt.decode(
        token,
        secret,
        algorithms=[ALGORITHM],
        options={"require": ["exp", "sub", "username", "role"]},
    )


def bearer_token_from_header(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.strip().split(None, 1)
    if len(parts) != 2:
        return None
    scheme, value = parts[0], parts[1].strip()
    if scheme.lower() != "bearer" or not value:
        return None
    return value

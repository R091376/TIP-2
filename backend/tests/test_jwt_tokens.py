"""JWT issue/verify unit tests."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError

from app.auth.jwt_tokens import (
    bearer_token_from_header,
    decode_access_token,
    issue_access_token,
)


def test_issue_and_decode_roundtrip():
    token, expires_in = issue_access_token(
        secret="s",
        user_id="u1",
        username="admin",
        role="ADMIN",
        expire_hours=8,
    )
    assert expires_in == 8 * 3600
    claims = decode_access_token(token, "s")
    assert claims["sub"] == "u1"
    assert claims["username"] == "admin"
    assert claims["role"] == "ADMIN"


def test_wrong_secret_rejected():
    token, _ = issue_access_token(
        secret="a", user_id="1", username="a", role="USER", expire_hours=1
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, "b")


def test_expired_token_rejected():
    now = datetime.now(timezone.utc)
    payload = {
        "sub": "1",
        "username": "a",
        "role": "USER",
        "iat": int((now - timedelta(hours=2)).timestamp()),
        "exp": int((now - timedelta(hours=1)).timestamp()),
    }
    token = jwt.encode(payload, "s", algorithm="HS256")
    with pytest.raises(ExpiredSignatureError):
        decode_access_token(token, "s")


def test_bearer_header_parse():
    assert bearer_token_from_header("Bearer abc.def") == "abc.def"
    assert bearer_token_from_header("bearer xyz") == "xyz"
    assert bearer_token_from_header("Basic x") is None
    assert bearer_token_from_header(None) is None

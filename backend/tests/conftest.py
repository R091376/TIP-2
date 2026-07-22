from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

# Force memory profile for unit tests before app import
os.environ["TIP_WATCHLIST_STORE"] = "memory"
os.environ["TIP_PROFILE"] = "memory"
os.environ["UPSTOX_ACCESS_TOKEN"] = ""

from app.config import clear_settings_cache  # noqa: E402


@pytest.fixture()
def client():
    clear_settings_cache()
    os.environ["TIP_WATCHLIST_STORE"] = "memory"
    os.environ["TIP_PROFILE"] = "memory"
    clear_settings_cache()

    from app.main import create_app

    application = create_app()
    with TestClient(application) as c:
        yield c

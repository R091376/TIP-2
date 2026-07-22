from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.db.base import Base
from app.user.entities import AppUserRow, CashLedgerRow
from app.user.models import UserRole
from app.user.service import UserService


@pytest.fixture()
def user_service():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    # register models
    assert AppUserRow.__tablename__
    assert CashLedgerRow.__tablename__
    Base.metadata.create_all(engine)
    sf = sessionmaker(bind=engine, expire_on_commit=False)
    settings = Settings()
    # avoid double-seed race: construct with factory
    svc = UserService(settings, session_factory=sf)
    return svc, sf


def test_admin_seeded_and_persists(user_service):
    svc, sf = user_service
    admin = svc.find_by_username("admin")
    assert admin is not None
    assert admin.role == UserRole.ADMIN
    with sf() as s:
        n = s.scalar(select(AppUserRow).where(AppUserRow.username == "admin"))
        # query count
        rows = s.scalars(select(AppUserRow)).all()
        assert any(r.username == "admin" for r in rows)
        ledgers = s.scalars(select(CashLedgerRow)).all()
        assert len(ledgers) >= 1


def test_create_authenticate_seed_reset(user_service):
    svc, sf = user_service
    u = svc.create_user("traderx", "secret1", UserRole.USER, "Trader", Decimal("50000"))
    assert u.cash_balance == Decimal("50000.00")
    assert svc.authenticate("traderx", "secret1") is not None
    assert svc.authenticate("traderx", "wrong") is None

    u2 = svc.seed_cash(u.id, Decimal("1000"))
    assert u2.cash_balance == Decimal("51000.00")

    u3 = svc.reset_user(u.id)
    assert u3.cash_balance == Decimal("100000.00")

    with sf() as s:
        ledgers = s.scalars(
            select(CashLedgerRow).where(CashLedgerRow.user_id == u.id)
        ).all()
        types = {x.entry_type for x in ledgers}
        assert "SEED" in types
        assert "RESET" in types


def test_last_admin_protected(user_service):
    svc, _ = user_service
    admin = svc.find_by_username("admin")
    assert admin is not None
    with pytest.raises(Exception):
        svc.update_user(admin.id, role=UserRole.USER)

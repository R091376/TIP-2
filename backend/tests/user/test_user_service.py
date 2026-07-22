from decimal import Decimal

from app.config import Settings
from app.user.models import UserRole
from app.user.service import UserService


def test_create_and_auth():
    s = Settings()
    us = UserService(s)
    u = us.create_user("trader1", "secret", UserRole.USER, "Trader", Decimal("50000"))
    assert u.username == "trader1"
    assert us.authenticate("trader1", "secret") is not None
    assert us.authenticate("trader1", "wrong") is None


def test_admin_seeded():
    s = Settings()
    us = UserService(s)
    admin = us.find_by_username(s.admin_username)
    assert admin is not None
    assert admin.role == UserRole.ADMIN


def test_seed_cash_topup_memory():
    s = Settings()
    us = UserService(s)
    u = us.create_user("cash1", "secret", seed_cash=Decimal("1000"))
    u2 = us.seed_cash(u.id, Decimal("500"))
    assert u2.cash_balance == Decimal("1500.00")

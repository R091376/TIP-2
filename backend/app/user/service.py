from __future__ import annotations

import logging
import re
import threading
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID, uuid4

import bcrypt
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.user.models import AppUser, UserRole

logger = logging.getLogger(__name__)
USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,64}$")
MIN_PASSWORD = 4
MAX_PASSWORD = 128


class UserService:
    """User admin + auth. Uses Postgres when session_factory is provided."""

    def __init__(self, settings: Settings, session_factory: sessionmaker[Session] | None = None) -> None:
        self._settings = settings
        self._sf = session_factory
        self._lock = threading.RLock()
        # memory fallback store
        self._users: dict[UUID, AppUser] = {}
        self._by_name: dict[str, UUID] = {}
        self.ensure_default_users()

    @property
    def is_postgres(self) -> bool:
        return self._sf is not None

    def ensure_default_users(self) -> None:
        """Ensure admin + test exist (local tip DB parity)."""
        self.ensure_admin_seeded()
        self.ensure_test_user_seeded()

    def ensure_admin_seeded(self) -> None:
        if self.is_postgres:
            self._ensure_admin_pg()
            return
        if self.find_by_username(self._settings.admin_username):
            return
        self.create_user(
            username=self._settings.admin_username,
            password=self._settings.tip_admin_password,
            role=UserRole.ADMIN,
            display_name=self._settings.admin_display_name,
            seed_cash=Decimal(str(self._settings.default_seed_cash)),
        )

    def ensure_test_user_seeded(self) -> None:
        if self.is_postgres:
            try:
                self._ensure_test_user_pg()
            except HTTPException as e:
                if e.status_code == 409:
                    return
                raise
            return
        username = (self._settings.test_username or "test").strip()
        if not username:
            return
        if self.find_by_username(username):
            return
        try:
            self.create_user(
                username=username,
                password=self._settings.tip_test_password or "test",
                role=UserRole.USER,
                display_name=self._settings.test_display_name or "Tester",
                seed_cash=Decimal(str(self._settings.default_seed_cash)),
            )
            logger.info("Bootstrapped default USER '%s'", username)
        except HTTPException as e:
            if e.status_code == 409:
                return
            raise

    def list_users(self) -> list[AppUser]:
        if self.is_postgres:
            return self._list_pg()
        with self._lock:
            return sorted(self._users.values(), key=lambda u: u.username.lower())

    def require_by_id(self, user_id: UUID) -> AppUser:
        u = self.find_by_id(user_id)
        if u is None:
            raise HTTPException(status_code=404, detail="User not found")
        return u

    def require_by_username(self, username: str) -> AppUser:
        u = self.find_by_username(username)
        if u is None:
            raise HTTPException(status_code=404, detail="User not found")
        return u

    def find_by_id(self, user_id: UUID) -> AppUser | None:
        if self.is_postgres:
            return self._find_id_pg(user_id)
        with self._lock:
            return self._users.get(user_id)

    def find_by_username(self, username: str) -> AppUser | None:
        if not username:
            return None
        if self.is_postgres:
            return self._find_name_pg(username)
        with self._lock:
            uid = self._by_name.get(username.strip().lower())
            return self._users.get(uid) if uid else None

    def authenticate(self, username: str, password: str) -> AppUser | None:
        user = self.find_by_username(username)
        if user is None or not user.active:
            return None
        if not bcrypt.checkpw(password.encode("utf-8"), user.password_hash.encode("utf-8")):
            return None
        return user

    def create_user(
        self,
        username: str,
        password: str,
        role: UserRole | None = None,
        display_name: str | None = None,
        seed_cash: Decimal | None = None,
    ) -> AppUser:
        un = self._normalize_username(username)
        self._validate_password(password)
        r = role or UserRole.USER
        cash = money(
            seed_cash if seed_cash is not None else Decimal(str(self._settings.default_seed_cash))
        )
        now = datetime.now(timezone.utc)
        user = AppUser(
            id=uuid4(),
            username=un,
            password_hash=_hash_password(password),
            role=r,
            display_name=_blank_to_null(display_name),
            cash_balance=cash,
            trading_enabled=True,
            active=True,
            created_at=now,
            updated_at=now,
        )
        if self.is_postgres:
            return self._create_pg(user, cash, "Initial seed cash")
        with self._lock:
            if un.lower() in self._by_name:
                raise HTTPException(status_code=409, detail=f"Username already exists: {un}")
            self._users[user.id] = user
            self._by_name[un.lower()] = user.id
            logger.info("Created user %s role=%s cash=%s", un, r, cash)
            return user

    def update_user(
        self,
        user_id: UUID,
        display_name: str | None = None,
        role: UserRole | None = None,
        trading_enabled: bool | None = None,
        active: bool | None = None,
    ) -> AppUser:
        user = self.require_by_id(user_id)
        if display_name is not None:
            user.display_name = _blank_to_null(display_name)
        if role is not None and role != user.role:
            if user.role == UserRole.ADMIN and role != UserRole.ADMIN:
                self._ensure_not_last_admin(user.id)
            user.role = role
        if trading_enabled is not None:
            user.trading_enabled = trading_enabled
        if active is not None:
            if user.role == UserRole.ADMIN and not active:
                self._ensure_not_last_admin(user.id)
            user.active = active
        user.updated_at = datetime.now(timezone.utc)
        if self.is_postgres:
            return self._save_pg(user)
        with self._lock:
            self._users[user.id] = user
            return user

    def set_password(self, user_id: UUID, password: str) -> None:
        self._validate_password(password)
        user = self.require_by_id(user_id)
        user.password_hash = _hash_password(password)
        user.updated_at = datetime.now(timezone.utc)
        if self.is_postgres:
            self._save_pg(user)
            logger.info("Password updated for user %s", user.username)
            return
        with self._lock:
            self._users[user.id] = user

    def seed_cash(self, user_id: UUID, amount: Decimal | None = None) -> AppUser:
        """Java parity: top-up by amount when provided; else set to default seed cash."""
        user = self.require_by_id(user_id)
        now = datetime.now(timezone.utc)
        if amount is not None:
            if Decimal(str(amount)) <= 0:
                raise HTTPException(status_code=400, detail="amount must be positive")
            add = money(amount)
            next_bal = money(user.cash_balance + add)
            user.cash_balance = next_bal
            user.updated_at = now
            if self.is_postgres:
                return self._save_pg(user, ledger=("SEED", add, next_bal, "Admin seed/top-up"))
            with self._lock:
                self._users[user.id] = user
                return user
        # no amount: set to default seed cash (legacy helper)
        cash = money(Decimal(str(self._settings.default_seed_cash)))
        delta = money(cash - user.cash_balance)
        user.cash_balance = cash
        user.updated_at = now
        if self.is_postgres:
            return self._save_pg(user, ledger=("SEED", delta, cash, "Admin seed cash set"))
        with self._lock:
            self._users[user.id] = user
            return user

    def reset_user(self, user_id: UUID, to_amount: Decimal | None = None) -> AppUser:
        """Set cash to default (or provided) and ledger RESET."""
        user = self.require_by_id(user_id)
        target = money(
            to_amount if to_amount is not None else Decimal(str(self._settings.default_seed_cash))
        )
        delta = money(target - user.cash_balance)
        user.cash_balance = target
        user.updated_at = datetime.now(timezone.utc)
        if self.is_postgres:
            return self._save_pg(
                user, ledger=("RESET", delta, target, f"Admin reset cash to {target}")
            )
        with self._lock:
            self._users[user.id] = user
            return user

    def set_trading(self, user_id: UUID, enabled: bool) -> AppUser:
        return self.update_user(user_id, trading_enabled=enabled)

    # --- postgres internals ---

    def _ensure_admin_pg(self) -> None:
        from app.user.entities import AppUserRow

        with self._sf() as s:
            n = s.scalar(
                select(func.count()).select_from(AppUserRow).where(AppUserRow.role == "ADMIN")
            )
            if n and n > 0:
                return
            un = self._settings.admin_username.strip().lower()
            row = s.scalars(
                select(AppUserRow).where(func.lower(AppUserRow.username) == un)
            ).first()
            if row is not None:
                row.role = "ADMIN"
                row.active = True
                row.updated_at = datetime.now(timezone.utc)
                s.commit()
                logger.info("Promoted existing user %s to ADMIN", un)
                return
        # create outside open session
        self.create_user(
            username=self._settings.admin_username,
            password=self._settings.tip_admin_password,
            role=UserRole.ADMIN,
            display_name=self._settings.admin_display_name,
            seed_cash=Decimal(str(self._settings.default_seed_cash)),
        )
        logger.info("Bootstrapped default ADMIN user '%s'", self._settings.admin_username)

    def _ensure_test_user_pg(self) -> None:
        """Postgres path used when V6 seed did not run / empty table edge cases."""
        username = (self._settings.test_username or "test").strip()
        if not username:
            return
        if self.find_by_username(username):
            return
        self.create_user(
            username=username,
            password=self._settings.tip_test_password or "test",
            role=UserRole.USER,
            display_name=self._settings.test_display_name or "Tester",
            seed_cash=Decimal(str(self._settings.default_seed_cash)),
        )
        logger.info("Bootstrapped default USER '%s' (postgres)", username)

    def _list_pg(self) -> list[AppUser]:
        from app.user.entities import AppUserRow

        with self._sf() as s:
            rows = s.scalars(select(AppUserRow).order_by(AppUserRow.username.asc())).all()
            return [self._row_to_user(r) for r in rows]

    def _find_id_pg(self, user_id: UUID) -> AppUser | None:
        from app.user.entities import AppUserRow

        with self._sf() as s:
            row = s.get(AppUserRow, user_id)
            return self._row_to_user(row) if row else None

    def _find_name_pg(self, username: str) -> AppUser | None:
        from app.user.entities import AppUserRow

        un = username.strip().lower()
        with self._sf() as s:
            row = s.scalars(
                select(AppUserRow).where(func.lower(AppUserRow.username) == un)
            ).first()
            return self._row_to_user(row) if row else None

    def _create_pg(self, user: AppUser, cash: Decimal, note: str) -> AppUser:
        from app.user.entities import AppUserRow, CashLedgerRow

        with self._sf() as s:
            exists = s.scalars(
                select(AppUserRow).where(func.lower(AppUserRow.username) == user.username.lower())
            ).first()
            if exists is not None:
                raise HTTPException(
                    status_code=409, detail=f"Username already exists: {user.username}"
                )
            s.add(
                AppUserRow(
                    id=user.id,
                    username=user.username,
                    password_hash=user.password_hash,
                    role=user.role.value,
                    display_name=user.display_name,
                    cash_balance=user.cash_balance,
                    trading_enabled=user.trading_enabled,
                    active=user.active,
                    created_at=user.created_at,
                    updated_at=user.updated_at,
                )
            )
            s.add(
                CashLedgerRow(
                    id=uuid4(),
                    user_id=user.id,
                    entry_type="SEED",
                    amount=cash,
                    balance_after=cash,
                    note=note,
                    created_at=user.created_at,
                )
            )
            s.commit()
            logger.info("Created user %s role=%s cash=%s", user.username, user.role, cash)
            return user

    def _save_pg(
        self,
        user: AppUser,
        ledger: tuple[str, Decimal, Decimal, str] | None = None,
    ) -> AppUser:
        from app.user.entities import AppUserRow, CashLedgerRow

        with self._sf() as s:
            row = s.get(AppUserRow, user.id)
            if row is None:
                raise HTTPException(status_code=404, detail="User not found")
            row.username = user.username
            row.password_hash = user.password_hash
            row.role = user.role.value if isinstance(user.role, UserRole) else str(user.role)
            row.display_name = user.display_name
            row.cash_balance = money(user.cash_balance)
            row.trading_enabled = user.trading_enabled
            row.active = user.active
            row.updated_at = user.updated_at
            if ledger is not None:
                entry_type, amount, balance_after, note = ledger
                s.add(
                    CashLedgerRow(
                        id=uuid4(),
                        user_id=user.id,
                        entry_type=entry_type,
                        amount=money(amount),
                        balance_after=money(balance_after),
                        note=note,
                        created_at=datetime.now(timezone.utc),
                    )
                )
            s.commit()
            s.refresh(row)
            return self._row_to_user(row)

    def _ensure_not_last_admin(self, user_id: UUID) -> None:
        if self.is_postgres:
            from app.user.entities import AppUserRow

            with self._sf() as s:
                n = s.scalar(
                    select(func.count())
                    .select_from(AppUserRow)
                    .where(AppUserRow.role == "ADMIN", AppUserRow.active.is_(True))
                )
                row = s.get(AppUserRow, user_id)
                if row and row.role == "ADMIN" and (n or 0) <= 1:
                    raise HTTPException(
                        status_code=409, detail="Cannot demote or deactivate the last admin"
                    )
            return
        admins = [
            u
            for u in self._users.values()
            if u.role == UserRole.ADMIN and u.active and u.id != user_id
        ]
        if not admins:
            raise HTTPException(
                status_code=409, detail="Cannot demote or deactivate the last admin"
            )

    def _normalize_username(self, username: str) -> str:
        if username is None or not str(username).strip():
            raise HTTPException(status_code=400, detail="username is required")
        un = username.strip().lower()
        if not USERNAME_RE.match(un):
            raise HTTPException(
                status_code=400,
                detail="username must be 3-64 chars [a-zA-Z0-9._-]",
            )
        return un

    def _validate_password(self, password: str) -> None:
        if password is None or not (MIN_PASSWORD <= len(password) <= MAX_PASSWORD):
            raise HTTPException(
                status_code=400,
                detail=f"password must be {MIN_PASSWORD}-{MAX_PASSWORD} characters",
            )

    @staticmethod
    def _row_to_user(row) -> AppUser:
        created = row.created_at
        updated = row.updated_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        return AppUser(
            id=row.id,
            username=row.username,
            password_hash=row.password_hash,
            role=UserRole(row.role),
            display_name=row.display_name,
            cash_balance=Decimal(str(row.cash_balance)),
            trading_enabled=row.trading_enabled,
            active=row.active,
            created_at=created,
            updated_at=updated,
        )


def money(v: Decimal | float | int | str) -> Decimal:
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _blank_to_null(s: str | None) -> str | None:
    if s is None or not s.strip():
        return None
    return s.strip()

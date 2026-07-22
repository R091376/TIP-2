from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    USER = "USER"


@dataclass
class AppUser:
    id: UUID
    username: str
    password_hash: str
    role: UserRole
    display_name: str | None
    cash_balance: Decimal
    trading_enabled: bool
    active: bool
    created_at: datetime
    updated_at: datetime

    def to_dto(self) -> dict:
        return {
            "id": str(self.id),
            "username": self.username,
            "displayName": self.display_name,
            "role": self.role.value if isinstance(self.role, UserRole) else self.role,
            "cashBalance": float(self.cash_balance),
            "tradingEnabled": self.trading_enabled,
            "active": self.active,
            "createdAt": self.created_at.isoformat().replace("+00:00", "Z"),
            "updatedAt": self.updated_at.isoformat().replace("+00:00", "Z"),
        }

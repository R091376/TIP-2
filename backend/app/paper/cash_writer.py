"""Persist paper cash_balance + unpublished ledger rows by LedgerEntry.id."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy.orm import Session, sessionmaker

from app.paper.models import LedgerEntry
from app.user.entities import AppUserRow, CashLedgerRow
from app.user.service import money


def write_user_cash(
    session_factory: sessionmaker[Session] | None,
    user_id: UUID,
    balance: Decimal,
    entries: list[LedgerEntry],
) -> None:
    """Write cash + ledger. Skip only when balance is unchanged and entries is empty."""
    if session_factory is None:
        return
    target = money(balance)
    unpublished = list(entries or [])
    with session_factory() as s:
        row = s.get(AppUserRow, user_id)
        if row is None:
            return
        prev = money(row.cash_balance)
        if prev == target and not unpublished:
            return
        now = datetime.now(timezone.utc)
        if prev != target:
            row.cash_balance = target
        row.updated_at = now
        if unpublished:
            bind = s.get_bind()
            if bind.dialect.name == "postgresql":
                from sqlalchemy.dialects.postgresql import insert
            else:
                from sqlalchemy.dialects.sqlite import insert

            payload = [
                {
                    "id": le.id,
                    "user_id": user_id,
                    "entry_type": (le.entry_type or "ADJUST")[:32],
                    "amount": money(le.amount),
                    "balance_after": money(le.balance_after),
                    "note": (le.note or "paper")[:512],
                    "created_at": now + timedelta(microseconds=i),
                }
                for i, le in enumerate(unpublished)
            ]
            stmt = insert(CashLedgerRow).values(payload)
            stmt = stmt.on_conflict_do_nothing(index_elements=["id"])
            s.execute(stmt)
        s.commit()

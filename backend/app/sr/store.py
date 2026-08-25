from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Protocol

from app.sr.models import METHOD_WOODIE_OPEN_V1, WoodieLevels


class DailySrStore(Protocol):
    def get(
        self, symbol_id: str, session_date: date, method: str = METHOD_WOODIE_OPEN_V1
    ) -> WoodieLevels | None: ...

    def insert_if_absent(
        self,
        symbol_id: str,
        session_date: date,
        levels: WoodieLevels,
        *,
        prev_candle_time: int,
        today_open_candle_time: int | None,
        freeze_source: str,
        force: bool = False,
    ) -> bool: ...

    def list_frozen_for_date(
        self, session_date: date, method: str = METHOD_WOODIE_OPEN_V1
    ) -> list[str]: ...

    def list_for_symbol(
        self,
        symbol_id: str,
        start: date,
        end: date,
        method: str = METHOD_WOODIE_OPEN_V1,
    ) -> list[tuple[date, WoodieLevels, str]]: ...


def _row_to_levels(row) -> WoodieLevels:
    return WoodieLevels(
        method=row.method,
        prev_high=float(row.prev_high),
        prev_low=float(row.prev_low),
        prev_close=float(row.prev_close),
        prev_open=None if row.prev_open is None else float(row.prev_open),
        today_open=float(row.today_open),
        range=float(row.range),
        pp=float(row.pp),
        r1=float(row.r1),
        s1=float(row.s1),
        r2=float(row.r2),
        s2=float(row.s2),
        r3=float(row.r3),
        s3=float(row.s3),
        r4=float(row.r4),
        s4=float(row.s4),
        gap=float(row.gap),
        gap_pct=None if row.gap_pct is None else float(row.gap_pct),
    )


class InMemoryDailySrStore:
    def __init__(self) -> None:
        self._rows: dict[tuple[str, date, str], tuple[object, WoodieLevels]] = {}

    def get(
        self, symbol_id: str, session_date: date, method: str = METHOD_WOODIE_OPEN_V1
    ) -> WoodieLevels | None:
        hit = self._rows.get((symbol_id, session_date, method))
        return None if hit is None else hit[1]

    def insert_if_absent(
        self,
        symbol_id: str,
        session_date: date,
        levels: WoodieLevels,
        *,
        prev_candle_time: int,
        today_open_candle_time: int | None,
        freeze_source: str,
        force: bool = False,
    ) -> bool:
        key = (symbol_id, session_date, levels.method)
        existing = self._rows.get(key)
        if existing is not None:
            if force and getattr(existing[0], "freeze_source", None) == "backfill":
                pass
            else:
                return False
        meta = type("M", (), {"freeze_source": freeze_source})()
        self._rows[key] = (meta, levels)
        return True

    def list_frozen_for_date(
        self, session_date: date, method: str = METHOD_WOODIE_OPEN_V1
    ) -> list[str]:
        return [
            sid
            for (sid, day, meth) in self._rows
            if day == session_date and meth == method
        ]

    def list_for_symbol(
        self,
        symbol_id: str,
        start: date,
        end: date,
        method: str = METHOD_WOODIE_OPEN_V1,
    ) -> list[tuple[date, WoodieLevels, str]]:
        out: list[tuple[date, WoodieLevels, str]] = []
        for (sid, day, meth), (meta, levels) in self._rows.items():
            if sid != symbol_id or meth != method:
                continue
            if day < start or day > end:
                continue
            src = getattr(meta, "freeze_source", "") or ""
            out.append((day, levels, src))
        out.sort(key=lambda row: row[0])
        return out


class PostgresDailySrStore:
    def __init__(self, session_factory) -> None:
        self._sf = session_factory

    def get(
        self, symbol_id: str, session_date: date, method: str = METHOD_WOODIE_OPEN_V1
    ) -> WoodieLevels | None:
        from app.journal.entities import DailySrLevelRow

        with self._sf() as s:
            row = s.get(
                DailySrLevelRow,
                {"symbol_id": symbol_id, "session_date": session_date, "method": method},
            )
            return None if row is None else _row_to_levels(row)

    def insert_if_absent(
        self,
        symbol_id: str,
        session_date: date,
        levels: WoodieLevels,
        *,
        prev_candle_time: int,
        today_open_candle_time: int | None,
        freeze_source: str,
        force: bool = False,
    ) -> bool:
        from sqlalchemy.exc import IntegrityError

        from app.journal.entities import DailySrLevelRow

        now = datetime.now(timezone.utc)
        with self._sf() as s:
            existing = s.get(
                DailySrLevelRow,
                {
                    "symbol_id": symbol_id,
                    "session_date": session_date,
                    "method": levels.method,
                },
            )
            if existing is not None:
                if force and existing.freeze_source == "backfill":
                    existing.prev_high = levels.prev_high
                    existing.prev_low = levels.prev_low
                    existing.prev_close = levels.prev_close
                    existing.prev_open = levels.prev_open
                    existing.today_open = levels.today_open
                    existing.range = levels.range
                    existing.prev_candle_time = int(prev_candle_time)
                    existing.today_open_candle_time = today_open_candle_time
                    existing.pp = levels.pp
                    existing.r1 = levels.r1
                    existing.s1 = levels.s1
                    existing.r2 = levels.r2
                    existing.s2 = levels.s2
                    existing.r3 = levels.r3
                    existing.s3 = levels.s3
                    existing.r4 = levels.r4
                    existing.s4 = levels.s4
                    existing.gap = levels.gap
                    existing.gap_pct = levels.gap_pct
                    existing.frozen_at = now
                    existing.freeze_source = freeze_source
                    existing.updated_at = now
                    s.commit()
                    return True
                return False
            s.add(
                DailySrLevelRow(
                    symbol_id=symbol_id,
                    session_date=session_date,
                    method=levels.method,
                    prev_high=levels.prev_high,
                    prev_low=levels.prev_low,
                    prev_close=levels.prev_close,
                    prev_open=levels.prev_open,
                    today_open=levels.today_open,
                    range=levels.range,
                    prev_candle_time=int(prev_candle_time),
                    today_open_candle_time=today_open_candle_time,
                    pp=levels.pp,
                    r1=levels.r1,
                    s1=levels.s1,
                    r2=levels.r2,
                    s2=levels.s2,
                    r3=levels.r3,
                    s3=levels.s3,
                    r4=levels.r4,
                    s4=levels.s4,
                    gap=levels.gap,
                    gap_pct=levels.gap_pct,
                    frozen_at=now,
                    freeze_source=freeze_source,
                    created_at=now,
                    updated_at=now,
                )
            )
            try:
                s.commit()
            except IntegrityError:
                s.rollback()
                return False
            return True

    def list_frozen_for_date(
        self, session_date: date, method: str = METHOD_WOODIE_OPEN_V1
    ) -> list[str]:
        from sqlalchemy import select

        from app.journal.entities import DailySrLevelRow

        with self._sf() as s:
            rows = s.scalars(
                select(DailySrLevelRow.symbol_id).where(
                    DailySrLevelRow.session_date == session_date,
                    DailySrLevelRow.method == method,
                )
            ).all()
            return list(rows)

    def list_for_symbol(
        self,
        symbol_id: str,
        start: date,
        end: date,
        method: str = METHOD_WOODIE_OPEN_V1,
    ) -> list[tuple[date, WoodieLevels, str]]:
        from sqlalchemy import select

        from app.journal.entities import DailySrLevelRow

        with self._sf() as s:
            rows = s.scalars(
                select(DailySrLevelRow)
                .where(
                    DailySrLevelRow.symbol_id == symbol_id,
                    DailySrLevelRow.session_date >= start,
                    DailySrLevelRow.session_date <= end,
                    DailySrLevelRow.method == method,
                )
                .order_by(DailySrLevelRow.session_date)
            ).all()
            return [
                (row.session_date, _row_to_levels(row), row.freeze_source) for row in rows
            ]

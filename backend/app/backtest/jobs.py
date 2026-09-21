from __future__ import annotations

import threading
from datetime import datetime, timezone
from decimal import Decimal
from typing import Protocol
from uuid import UUID, uuid4

from app.backtest.spec import PatternSpec
from app.user.service import money


def _now():
    return datetime.now(timezone.utc)


class BacktestJobStore(Protocol):
    def create(self, *, created_by: str, spec: PatternSpec) -> dict: ...
    def get(self, run_id: UUID | str) -> dict | None: ...
    def list_recent(self, limit: int = 50) -> list[dict]: ...
    def mark_running(self, run_id: UUID | str) -> None: ...
    def mark_done(self, run_id: UUID | str, summary: dict, trades: list[dict]) -> None: ...
    def mark_failed(self, run_id: UUID | str, message: str) -> None: ...
    def trades(self, run_id: UUID | str, limit: int = 500) -> list[dict]: ...
    def clear_all(self) -> int: ...


def _run_dto(row, trades: list | None = None) -> dict:
    body = {
        "id": str(row.id),
        "createdBy": row.created_by,
        "status": row.status,
        "spec": row.spec_json,
        "errorMessage": row.error_message,
        "summary": row.summary_json,
        "createdAt": row.created_at.isoformat().replace("+00:00", "Z") if row.created_at else None,
        "startedAt": row.started_at.isoformat().replace("+00:00", "Z") if row.started_at else None,
        "finishedAt": row.finished_at.isoformat().replace("+00:00", "Z") if row.finished_at else None,
    }
    if trades is not None:
        body["trades"] = trades
    return body


class InMemoryBacktestJobStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._runs: dict[str, dict] = {}
        self._trades: dict[str, list[dict]] = {}

    def create(self, *, created_by: str, spec: PatternSpec) -> dict:
        rid = str(uuid4())
        now = _now()
        row = {
            "id": rid,
            "createdBy": created_by,
            "status": "queued",
            "spec": spec.to_dict(),
            "errorMessage": None,
            "summary": None,
            "createdAt": now.isoformat().replace("+00:00", "Z"),
            "startedAt": None,
            "finishedAt": None,
        }
        with self._lock:
            self._runs[rid] = row
            self._trades[rid] = []
        return dict(row)

    def get(self, run_id: UUID | str) -> dict | None:
        with self._lock:
            row = self._runs.get(str(run_id))
            return dict(row) if row else None

    def list_recent(self, limit: int = 50) -> list[dict]:
        with self._lock:
            rows = sorted(
                self._runs.values(), key=lambda r: r.get("createdAt") or "", reverse=True
            )
            return [dict(r) for r in rows[: max(1, limit)]]

    def mark_running(self, run_id: UUID | str) -> None:
        with self._lock:
            row = self._runs.get(str(run_id))
            if row:
                row["status"] = "running"
                row["startedAt"] = _now().isoformat().replace("+00:00", "Z")

    def mark_done(self, run_id: UUID | str, summary: dict, trades: list[dict]) -> None:
        with self._lock:
            row = self._runs.get(str(run_id))
            if not row:
                return
            row["status"] = "done"
            row["summary"] = summary
            row["finishedAt"] = _now().isoformat().replace("+00:00", "Z")
            row["errorMessage"] = None
            self._trades[str(run_id)] = list(trades or [])

    def mark_failed(self, run_id: UUID | str, message: str) -> None:
        with self._lock:
            row = self._runs.get(str(run_id))
            if row:
                row["status"] = "failed"
                row["errorMessage"] = (message or "failed")[:2000]
                row["finishedAt"] = _now().isoformat().replace("+00:00", "Z")

    def trades(self, run_id: UUID | str, limit: int = 500) -> list[dict]:
        with self._lock:
            rows = self._trades.get(str(run_id), [])
            return list(rows[: max(1, limit)])

    def clear_all(self) -> int:
        with self._lock:
            n = len(self._runs)
            self._runs.clear()
            self._trades.clear()
            return n


class PostgresBacktestJobStore:
    def __init__(self, session_factory) -> None:
        self._sf = session_factory

    def create(self, *, created_by: str, spec: PatternSpec) -> dict:
        from app.market.warehouse_entities import BacktestRunRow

        rid = uuid4()
        now = _now()
        with self._sf() as s:
            row = BacktestRunRow(
                id=rid,
                created_by=created_by,
                status="queued",
                spec_json=spec.to_dict(),
                error_message=None,
                summary_json=None,
                created_at=now,
                started_at=None,
                finished_at=None,
            )
            s.add(row)
            s.commit()
            s.refresh(row)
            return _run_dto(row)

    def get(self, run_id: UUID | str) -> dict | None:
        from app.market.warehouse_entities import BacktestRunRow

        with self._sf() as s:
            row = s.get(BacktestRunRow, _as_uuid(run_id))
            return None if row is None else _run_dto(row)

    def list_recent(self, limit: int = 50) -> list[dict]:
        from sqlalchemy import select

        from app.market.warehouse_entities import BacktestRunRow

        with self._sf() as s:
            rows = s.scalars(
                select(BacktestRunRow)
                .order_by(BacktestRunRow.created_at.desc())
                .limit(max(1, limit))
            ).all()
            return [_run_dto(r) for r in rows]

    def mark_running(self, run_id: UUID | str) -> None:
        from app.market.warehouse_entities import BacktestRunRow

        with self._sf() as s:
            row = s.get(BacktestRunRow, _as_uuid(run_id))
            if row is None:
                return
            row.status = "running"
            row.started_at = _now()
            s.commit()

    def mark_done(self, run_id: UUID | str, summary: dict, trades: list[dict]) -> None:
        from uuid import UUID as _UUID

        from app.market.warehouse_entities import BacktestRunRow, BacktestTradeRow

        rid = _as_uuid(run_id)
        now = _now()
        with self._sf() as s:
            row = s.get(BacktestRunRow, rid)
            if row is None:
                return
            row.status = "done"
            row.summary_json = summary
            row.finished_at = now
            row.error_message = None
            for t in trades or []:
                s.add(
                    BacktestTradeRow(
                        id=_UUID(str(t.get("id") or uuid4())),
                        run_id=rid,
                        symbol_id=str(t.get("symbolId") or ""),
                        trading_symbol=t.get("tradingSymbol"),
                        timeframe=str(t.get("timeframe") or ""),
                        pattern_type=str(t.get("patternType") or ""),
                        direction=str(t.get("direction") or ""),
                        detect_time=int(t.get("detectTime") or 0),
                        entry_time=t.get("entryTime"),
                        exit_time=t.get("exitTime"),
                        entry=t.get("entry"),
                        stop=t.get("stop"),
                        target=t.get("target"),
                        fill_entry=t.get("fillEntry"),
                        fill_exit=t.get("fillExit"),
                        outcome=t.get("outcome"),
                        r_multiple=t.get("rMultiple"),
                        pnl=t.get("pnl"),
                        pnl_net=t.get("pnlNet"),
                        charges_entry=t.get("chargesEntry"),
                        charges_exit=t.get("chargesExit"),
                        r_multiple_net=t.get("rMultipleNet"),
                        qty=int(t.get("qty") or 1),
                        flag_confirmed=bool(t.get("flagConfirmed")),
                        flag_retested=bool(t.get("flagRetested")),
                        flag_entry_reached=bool(t.get("flagEntryReached")),
                        volume_ok=bool(t.get("volumeOk")),
                        mfe_r=t.get("mfeR"),
                        mae_r=t.get("maeR"),
                        instance_id=t.get("instanceId"),
                    )
                )
            s.commit()

    def mark_failed(self, run_id: UUID | str, message: str) -> None:
        from app.market.warehouse_entities import BacktestRunRow

        with self._sf() as s:
            row = s.get(BacktestRunRow, _as_uuid(run_id))
            if row is None:
                return
            row.status = "failed"
            row.error_message = (message or "failed")[:2000]
            row.finished_at = _now()
            s.commit()

    def trades(self, run_id: UUID | str, limit: int = 500) -> list[dict]:
        from sqlalchemy import select

        from app.market.warehouse_entities import BacktestTradeRow

        with self._sf() as s:
            rows = s.scalars(
                select(BacktestTradeRow)
                .where(BacktestTradeRow.run_id == _as_uuid(run_id))
                .order_by(BacktestTradeRow.detect_time)
                .limit(max(1, limit))
            ).all()
            return [
                {
                    "id": str(r.id),
                    "instanceId": r.instance_id,
                    "symbolId": r.symbol_id,
                    "tradingSymbol": r.trading_symbol,
                    "timeframe": r.timeframe,
                    "patternType": r.pattern_type,
                    "direction": r.direction,
                    "detectTime": r.detect_time,
                    "entryTime": r.entry_time,
                    "exitTime": r.exit_time,
                    "entry": r.entry,
                    "stop": r.stop,
                    "target": r.target,
                    "fillEntry": r.fill_entry,
                    "fillExit": r.fill_exit,
                    "outcome": r.outcome,
                    "rMultiple": r.r_multiple,
                    "rMultipleNet": r.r_multiple_net,
                    "pnl": r.pnl,
                    "pnlNet": r.pnl_net,
                    "pnlPctNet": _pnl_pct_net(r),
                    "chargesEntry": r.charges_entry,
                    "chargesExit": r.charges_exit,
                    "chargesTotal": _charges_total(r.charges_entry, r.charges_exit),
                    "qty": r.qty,
                    "flagConfirmed": r.flag_confirmed,
                    "flagRetested": r.flag_retested,
                    "flagEntryReached": bool(getattr(r, "flag_entry_reached", False)),
                    "volumeOk": r.volume_ok,
                    "mfeR": r.mfe_r,
                    "maeR": r.mae_r,
                }
                for r in rows
            ]


    def clear_all(self) -> int:
        from sqlalchemy import delete

        from app.market.warehouse_entities import BacktestRunRow, BacktestTradeRow

        with self._sf() as s:
            s.execute(delete(BacktestTradeRow))
            result = s.execute(delete(BacktestRunRow))
            s.commit()
            return int(result.rowcount or 0)


def _as_uuid(run_id: UUID | str) -> UUID:
    return run_id if isinstance(run_id, UUID) else UUID(str(run_id))


def _charges_total(entry: float | None, exit_amt: float | None) -> float | None:
    if entry is None or exit_amt is None:
        return None
    return float(money(Decimal(str(entry)) + Decimal(str(exit_amt))))


def _pnl_pct_net(r) -> float | None:
    if r.pnl_net is None:
        return None
    px = r.fill_entry if r.fill_entry is not None else r.entry
    try:
        price = float(px)
        qty = max(1, int(r.qty or 1))
    except (TypeError, ValueError):
        return None
    if not (price > 0):
        return None
    return float(r.pnl_net) / (abs(price) * qty)

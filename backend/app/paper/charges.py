"""Pure NSE cash equity charge engine (no I/O)."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, replace
from decimal import Decimal, InvalidOperation
from enum import StrEnum
from typing import Any

from app.paper.models import Intent, Product, Side
from app.user.service import money

logger = logging.getLogger(__name__)

# Illustrative Zerodha-like equity cash card — not a contract note, not official NSE.
_SCHEDULE_ID_V1 = "nse_eq_cash_v1"

_DECIMAL_FIELDS = frozenset(
    {
        "brokerage_pct",
        "brokerage_flat_cap",
        "stt_delivery_pct",
        "stt_intraday_sell_pct",
        "nse_txn_pct",
        "sebi_pct",
        "stamp_buy_delivery_pct",
        "stamp_buy_intraday_pct",
        "gst_pct",
        "dp_flat",
    }
)
_BOOL_FIELDS = frozenset({"brokerage_cnc_enabled", "dp_gst"})


class ChargeCode(StrEnum):
    BROKERAGE = "BROKERAGE"
    STT = "STT"
    EXCHANGE_TXN = "EXCHANGE_TXN"
    SEBI = "SEBI"
    STAMP = "STAMP"
    GST = "GST"
    DP = "DP"


@dataclass(frozen=True, slots=True)
class ChargeLine:
    code: ChargeCode
    amount: Decimal  # money(), always >= 0
    note: str | None = None


@dataclass(frozen=True, slots=True)
class ChargeBreakdown:
    schedule_id: str
    schedule_version: int
    lines: tuple[ChargeLine, ...]
    total: Decimal

    def persistable_lines(self) -> tuple[ChargeLine, ...]:
        return tuple(ln for ln in self.lines if ln.amount > 0)


@dataclass(frozen=True, slots=True)
class ChargeContext:
    side: Side
    product: Product
    intent: Intent
    qty: int
    price: Decimal
    notional: Decimal
    dp_already_charged_today: bool = False


@dataclass(frozen=True, slots=True)
class ChargeSchedule:
    id: str
    version: int
    brokerage_pct: Decimal
    brokerage_flat_cap: Decimal
    brokerage_cnc_enabled: bool
    stt_delivery_pct: Decimal
    stt_intraday_sell_pct: Decimal
    nse_txn_pct: Decimal
    sebi_pct: Decimal
    stamp_buy_delivery_pct: Decimal
    stamp_buy_intraday_pct: Decimal
    gst_pct: Decimal
    dp_flat: Decimal
    dp_gst: bool


NSE_EQ_CASH_V1 = ChargeSchedule(
    id=_SCHEDULE_ID_V1,
    version=1,
    brokerage_pct=Decimal("0.0003"),
    brokerage_flat_cap=Decimal("20.00"),
    brokerage_cnc_enabled=False,
    stt_delivery_pct=Decimal("0.001"),
    stt_intraday_sell_pct=Decimal("0.00025"),
    nse_txn_pct=Decimal("0.0000307"),
    sebi_pct=Decimal("0.000001"),
    stamp_buy_delivery_pct=Decimal("0.00015"),
    stamp_buy_intraday_pct=Decimal("0.00003"),
    gst_pct=Decimal("0.18"),
    dp_flat=Decimal("0.00"),
    dp_gst=True,
)


def compute_charges(
    ctx: ChargeContext,
    schedule: ChargeSchedule,
    *,
    enabled: bool,
) -> ChargeBreakdown:
    """All line amounts go through money(); total is sum of rounded lines."""
    if not enabled or ctx.qty <= 0:
        return ChargeBreakdown(
            schedule_id="off",
            schedule_version=0,
            lines=(),
            total=money(0),
        )

    notional = money(ctx.notional)
    brokerage = _brokerage(ctx, schedule, notional)
    stt = _stt(ctx, schedule, notional)
    exchange = money(schedule.nse_txn_pct * notional)
    sebi = money(schedule.sebi_pct * notional)
    stamp = _stamp(ctx, schedule, notional)
    dp = _dp(ctx, schedule)
    taxable = brokerage + exchange + sebi
    if schedule.dp_gst:
        taxable += dp
    gst = money(schedule.gst_pct * taxable) if taxable > 0 else money(0)

    lines = (
        ChargeLine(ChargeCode.BROKERAGE, brokerage),
        ChargeLine(ChargeCode.STT, stt),
        ChargeLine(ChargeCode.EXCHANGE_TXN, exchange),
        ChargeLine(ChargeCode.SEBI, sebi),
        ChargeLine(ChargeCode.STAMP, stamp),
        ChargeLine(ChargeCode.GST, gst),
        ChargeLine(ChargeCode.DP, dp),
    )
    total = money(sum((ln.amount for ln in lines), Decimal("0")))
    return ChargeBreakdown(
        schedule_id=schedule.id,
        schedule_version=schedule.version,
        lines=lines,
        total=total,
    )


def load_charge_schedule(settings: Any) -> ChargeSchedule:
    """Resolve in-code nse_eq_cash_v1, optionally overlaid by JSON (decimal strings only)."""
    base = NSE_EQ_CASH_V1
    requested = (getattr(settings, "paper_charges_schedule_id", "") or "").strip() or base.id
    if requested != base.id:
        logger.error(
            "unknown paper charge schedule_id=%s; falling back to %s",
            requested,
            base.id,
        )
        _log_resolved(settings, base)
        return base

    raw = (getattr(settings, "paper_charges_schedule_json", "") or "").strip()
    if not raw:
        _log_resolved(settings, base)
        return base

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("invalid paper_charges_schedule_json; falling back to in-code default")
        _log_resolved(settings, base)
        return base

    if not isinstance(payload, dict):
        logger.error(
            "paper_charges_schedule_json is not an object; falling back to in-code default"
        )
        _log_resolved(settings, base)
        return base

    overlay_id = payload.get("id")
    if overlay_id is not None and overlay_id != base.id:
        logger.error(
            "unknown paper charge schedule_id=%s in overlay; falling back to in-code default",
            overlay_id,
        )
        _log_resolved(settings, base)
        return base

    updates = _overlay_updates(payload)
    if updates is None:
        _log_resolved(settings, base)
        return base

    sched = replace(base, **updates)
    _log_resolved(settings, sched)
    return sched


def _brokerage(ctx: ChargeContext, schedule: ChargeSchedule, notional: Decimal) -> Decimal:
    if schedule.brokerage_pct == 0:
        return money(0)
    if ctx.product == Product.CNC and not schedule.brokerage_cnc_enabled:
        return money(0)
    return money(min(schedule.brokerage_flat_cap, money(schedule.brokerage_pct * notional)))


def _stt(ctx: ChargeContext, schedule: ChargeSchedule, notional: Decimal) -> Decimal:
    if ctx.product == Product.CNC:
        return money(schedule.stt_delivery_pct * notional)
    if ctx.intent in (Intent.CLOSE_LONG, Intent.OPEN_SHORT):
        return money(schedule.stt_intraday_sell_pct * notional)
    return money(0)


def _stamp(ctx: ChargeContext, schedule: ChargeSchedule, notional: Decimal) -> Decimal:
    if ctx.intent not in (Intent.OPEN_LONG, Intent.COVER_SHORT):
        return money(0)
    pct = (
        schedule.stamp_buy_delivery_pct
        if ctx.product == Product.CNC
        else schedule.stamp_buy_intraday_pct
    )
    return money(pct * notional)


def _dp(ctx: ChargeContext, schedule: ChargeSchedule) -> Decimal:
    if ctx.intent != Intent.CLOSE_LONG or ctx.product != Product.CNC:
        return money(0)
    if schedule.dp_flat <= 0 or ctx.dp_already_charged_today:
        return money(0)
    return money(schedule.dp_flat)


def _overlay_updates(payload: dict) -> dict | None:
    """Return replace() kwargs, or None if the overlay must be rejected."""
    updates: dict = {}

    if "stamp_buy_pct" in payload:
        parsed = _parse_decimal_field("stamp_buy_pct", payload["stamp_buy_pct"])
        if parsed is None:
            return None
        updates["stamp_buy_delivery_pct"] = parsed
        updates["stamp_buy_intraday_pct"] = parsed

    for key in _DECIMAL_FIELDS:
        if key not in payload:
            continue
        parsed = _parse_decimal_field(key, payload[key])
        if parsed is None:
            return None
        updates[key] = parsed

    for key in _BOOL_FIELDS:
        if key not in payload:
            continue
        val = payload[key]
        if not isinstance(val, bool):
            logger.error(
                "paper_charges_schedule_json field %s must be a bool, got %s; "
                "falling back to in-code default",
                key,
                type(val).__name__,
            )
            return None
        updates[key] = val

    if "version" in payload:
        ver = payload["version"]
        if type(ver) is not int:
            logger.error(
                "paper_charges_schedule_json field version must be an int, got %s; "
                "falling back to in-code default",
                type(ver).__name__,
            )
            return None
        updates["version"] = ver

    if "id" in payload:
        sid = payload["id"]
        if not isinstance(sid, str):
            logger.error(
                "paper_charges_schedule_json field id must be a string; "
                "falling back to in-code default"
            )
            return None
        updates["id"] = sid

    return updates


def _parse_decimal_field(key: str, value: object) -> Decimal | None:
    if not isinstance(value, str):
        logger.error(
            "paper_charges_schedule_json field %s must be a decimal string, got %s; "
            "falling back to in-code default",
            key,
            type(value).__name__,
        )
        return None
    try:
        return Decimal(value)
    except (InvalidOperation, ValueError):
        logger.error(
            "paper_charges_schedule_json field %s is not a valid decimal; "
            "falling back to in-code default",
            key,
        )
        return None


def _log_resolved(settings: Any, schedule: ChargeSchedule) -> None:
    logger.info(
        "paper charges enabled=%s schedule=%s version=%s",
        bool(getattr(settings, "paper_charges_enabled", False)),
        schedule.id,
        schedule.version,
    )

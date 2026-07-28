"""Tick matching rules (pure predicates + fill sizing)."""

from __future__ import annotations

from decimal import Decimal

from app.paper.models import OrderStatus, OrderType, PaperOrder, Side, WorkingOrderType


def is_trigger_hit(order: PaperOrder, price: Decimal) -> bool:
    if order.trigger_price is None:
        return False
    t = Decimal(str(order.trigger_price))
    if order.side == Side.BUY:
        return price >= t
    return price <= t


def is_limit_marketable(order: PaperOrder, price: Decimal) -> bool:
    if order.price is None:
        return False
    lim = Decimal(str(order.price))
    if order.side == Side.BUY:
        return price <= lim
    return price >= lim


def market_fill_allowed(
    order: PaperOrder,
    seen_tick_seq: int,
    *,
    same_tick_ok: bool = False,
) -> bool:
    """MARKET working: need seen_tick_seq > market_ready_after_seq unless same_tick_ok."""
    if order.warmup_required:
        return False
    if order.working_order_type != WorkingOrderType.MARKET:
        return False
    if order.status not in (
        OrderStatus.OPEN,
        OrderStatus.PARTIALLY_FILLED,
        OrderStatus.TRIGGER_PENDING,
    ):
        return False
    if same_tick_ok:
        return seen_tick_seq >= order.market_ready_after_seq
    return seen_tick_seq > order.market_ready_after_seq


def attempt_fill_qty(order: PaperOrder, max_per_tick: int | None = None) -> int:
    rem = order.remaining
    if rem <= 0:
        return 0
    if max_per_tick is not None and max_per_tick > 0:
        return min(rem, max_per_tick)
    return rem


def should_activate_stop(order: PaperOrder, price: Decimal) -> bool:
    if order.status != OrderStatus.TRIGGER_PENDING:
        return False
    if order.order_type not in (OrderType.SL, OrderType.SL_M):
        return False
    return is_trigger_hit(order, price)

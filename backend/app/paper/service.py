"""PaperTradingService — manual OMS façade (in-process book + optional PG sync)."""

from __future__ import annotations

import logging
import threading
from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.market.models import Tick
from app.market.nse_clock import MarketPhase, phase_at, phase_from_clock
from app.market.session_policy import (
    SessionKind,
    cts_close_minutes,
    session_kind_from_entry,
)
from app.paper.cash import (
    apply_fill_cash,
    lock_reference_price,
    release_order_lock,
    required_order_lock_amount,
    resolve_intent,
    recompute_order_lock,
    ensure_short_margin,
)
from app.paper.charges import ChargeContext, compute_charges, load_charge_schedule
from app.paper.eligibility import is_paper_tradable
from app.paper.last_price import LastPriceCache
from app.paper.matching import (
    attempt_fill_qty,
    is_limit_marketable,
    market_fill_allowed,
    should_activate_stop,
)
from app.paper.models import (
    OPEN_STATUSES,
    TERMINAL_STATUSES,
    CashAccount,
    CashLock,
    Intent,
    LockReason,
    LotSide,
    LotStatus,
    OrderSource,
    OrderStatus,
    OrderType,
    PaperFill,
    PaperOrder,
    PositionLot,
    Product,
    Side,
    WorkingOrderType,
)
from app.paper.worker import PaperMatcherWorker
from app.user.service import money
from app.watchlist.repository import WatchlistRepository

logger = logging.getLogger(__name__)

try:
    from zoneinfo import ZoneInfo

    NSE_ZONE = ZoneInfo("Asia/Kolkata")
except Exception:  # pragma: no cover
    NSE_ZONE = timezone.utc


class PaperTradingService:
    def __init__(
        self,
        settings: Settings,
        watchlist_repo: WatchlistRepository,
        session_factory: sessionmaker[Session] | None = None,
        *,
        user_cash_provider=None,
        user_cash_writer=None,
    ) -> None:
        self._settings = settings
        self._watchlist = watchlist_repo
        self._sf = session_factory
        self._ltp = LastPriceCache()
        self._user_locks: dict[UUID, threading.RLock] = {}
        self._global = threading.RLock()
        self._accept_seq = 0
        self._seen_tick_seq: dict[str, int] = {}
        self._orders: dict[UUID, PaperOrder] = {}
        self._lots: dict[UUID, PositionLot] = {}
        self._fills: list[PaperFill] = []
        self._accounts: dict[UUID, CashAccount] = {}
        self._open_by_symbol: dict[str, set[UUID]] = {}
        self._square_off_dates: set[date] = set()
        self._square_off_ran: set[tuple[date, str]] = set()
        self._cts_sl_cancelled: set[date] = set()
        self._user_cash_provider = user_cash_provider  # (user_id) -> Decimal
        self._user_cash_writer = user_cash_writer  # (user_id, balance, ledger_entries)
        self._charge_schedule = load_charge_schedule(settings)
        self._worker = PaperMatcherWorker(
            self._on_drain,
            square_off_check=self.maybe_mis_square_off,
            square_off_interval_s=5.0,
        )
        self._started = False

    # --- lifecycle ---

    @property
    def enabled(self) -> bool:
        return bool(getattr(self._settings, "paper_enabled", True))

    @property
    def last_price(self) -> LastPriceCache:
        return self._ltp

    def start(self) -> None:
        if not self.enabled:
            return
        if self._sf is not None:
            try:
                self._load_from_db()
            except Exception:
                logger.exception("paper load_from_db failed; continuing with empty book")
        self._worker.start()
        self._started = True

    def stop(self) -> None:
        self._worker.stop()
        self._started = False

    def enqueue_tick(self, tick: Tick) -> None:
        if not self.enabled:
            return
        self._ltp.update(tick)
        self._worker.enqueue_tick(tick)

    def _user_lock(self, user_id: UUID) -> threading.RLock:
        with self._global:
            if user_id not in self._user_locks:
                self._user_locks[user_id] = threading.RLock()
            return self._user_locks[user_id]

    def _next_accept_seq(self) -> int:
        with self._global:
            self._accept_seq += 1
            return self._accept_seq

    def _account(self, user_id: UUID) -> CashAccount:
        if user_id not in self._accounts:
            bal = money(0)
            if self._user_cash_provider:
                try:
                    bal = money(self._user_cash_provider(user_id))
                except Exception:
                    logger.exception("cash provider failed for %s", user_id)
            self._accounts[user_id] = CashAccount(user_id=user_id, cash_balance=bal)
        return self._accounts[user_id]

    def sync_user_cash(self, user_id: UUID, balance: Decimal) -> None:
        acc = self._account(user_id)
        acc.cash_balance = money(balance)

    # --- place / modify / cancel ---

    def place_order(
        self,
        user_id: UUID,
        *,
        instrument_key: str,
        side: str,
        order_type: str,
        product: str,
        qty: int,
        price: float | None = None,
        trigger_price: float | None = None,
        close_lot_id: str | None = None,
        client_order_id: str | None = None,
        trading_enabled: bool = True,
        source: OrderSource = OrderSource.USER,
    ) -> dict:
        self._require_enabled()
        if not trading_enabled and source == OrderSource.USER:
            raise HTTPException(
                status_code=403,
                detail={"code": "TRADING_DISABLED", "message": "Trading is disabled"},
            )
        if qty < 1:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_QTY", "message": "qty must be >= 1"},
            )

        side_e = Side(side.upper())
        ot_raw = order_type.upper().replace("-", "_")
        if ot_raw in ("SLM", "SL_M"):
            type_e = OrderType.SL_M
        else:
            type_e = OrderType(ot_raw)
        product_e = Product(product.upper())
        close_id = UUID(close_lot_id) if close_lot_id else None
        client_id = (client_order_id or "").strip() or None

        # NSE cash CNC cannot open a short. SELL CNC is close-only (closeLotId).
        if product_e == Product.CNC and side_e == Side.SELL and close_id is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "CNC_SHORT_NOT_ALLOWED",
                    "message": "CNC cannot open a short; sell CNC only to close a delivery long",
                },
            )

        # eligibility for opens
        entry = self._watchlist.find_by_symbol_id(instrument_key)
        if close_id is None:
            if entry is None or not is_paper_tradable(entry):
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "INSTRUMENT_NOT_TRADABLE",
                        "message": "Symbol not paper-tradable (watchlist equities only)",
                    },
                )
        trading_symbol = entry.trading_symbol if entry else instrument_key.split("|")[-1]
        if source == OrderSource.USER:
            self._require_user_session_open(entry)

        px = Decimal(str(price)) if price is not None else None
        tpx = Decimal(str(trigger_price)) if trigger_price is not None else None
        self._validate_prices(type_e, px, tpx)
        if type_e == OrderType.SL and px is not None and tpx is not None:
            if side_e == Side.BUY and px < tpx:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "INVALID_SL_BAND",
                        "message": "BUY SL requires price >= triggerPrice",
                    },
                )
            if side_e == Side.SELL and px > tpx:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "INVALID_SL_BAND",
                        "message": "SELL SL requires price <= triggerPrice",
                    },
                )


        with self._user_lock(user_id):
            open_orders = [
                o
                for o in self._orders.values()
                if o.user_id == user_id and o.status in OPEN_STATUSES
            ]
            open_lots = [
                L
                for L in self._lots.values()
                if L.user_id == user_id and L.status == LotStatus.OPEN
            ]
            max_o = int(getattr(self._settings, "paper_max_open_orders", 50))
            max_l = int(getattr(self._settings, "paper_max_open_lots", 50))
            if len(open_orders) >= max_o:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "MAX_OPEN_ORDERS", "message": f"Max open orders {max_o}"},
                )
            if close_id is None and len(open_lots) >= max_l:
                # still allow closes
                pass

            if close_id is not None:
                lot = self._lots.get(close_id)
                if lot is None or lot.user_id != user_id or lot.status != LotStatus.OPEN:
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "LOT_NOT_FOUND", "message": "closeLotId invalid"},
                    )
                if lot.product != product_e:
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "PRODUCT_MISMATCH", "message": "product must match lot"},
                    )
                if lot.instrument_key != instrument_key:
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "SYMBOL_MISMATCH", "message": "instrument mismatch"},
                    )
                if qty > lot.qty_open:
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "QTY_EXCEEDS_LOT", "message": "qty > lot open"},
                    )
                # side must be opposite
                if lot.side == LotSide.LONG and side_e != Side.SELL:
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "SIDE_MISMATCH", "message": "close long with SELL"},
                    )
                if lot.side == LotSide.SHORT and side_e != Side.BUY:
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "SIDE_MISMATCH", "message": "cover short with BUY"},
                    )
            else:
                # new open: check max lots
                if len(open_lots) >= max_l:
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "MAX_OPEN_LOTS", "message": f"Max open lots {max_l}"},
                    )

            if client_id:
                for o in self._orders.values():
                    if o.user_id == user_id and o.client_order_id == client_id:
                        raise HTTPException(
                            status_code=409,
                            detail={"code": "DUPLICATE_CLIENT_ORDER_ID", "message": client_id},
                        )

            acc = self._account(user_id)
            intent = (
                Intent.OPEN_LONG
                if close_id is None and side_e == Side.BUY
                else Intent.OPEN_SHORT
                if close_id is None
                else Intent.COVER_SHORT
                if side_e == Side.BUY
                else Intent.CLOSE_LONG
            )
            haircut = Decimal(str(getattr(self._settings, "paper_market_lock_haircut", 1.02)))
            ltp = self._ltp.get_price(instrument_key)
            lock_px = lock_reference_price(type_e, px, ltp, haircut)
            if intent in (Intent.OPEN_LONG, Intent.OPEN_SHORT):
                if type_e in (OrderType.MARKET, OrderType.SL_M) and lock_px is None:
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "NO_LTP", "message": "No LTP for lock sizing"},
                    )
                need = required_order_lock_amount(intent, qty, lock_px)
                if need > acc.free_cash():
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "code": "INSUFFICIENT_CASH",
                            "message": f"Need lock {need}, free {acc.free_cash()}",
                        },
                    )

            now = datetime.now(timezone.utc)
            accept_seq = self._next_accept_seq()
            seen = self._seen_tick_seq.get(instrument_key, 0)

            if type_e in (OrderType.SL, OrderType.SL_M):
                status = OrderStatus.TRIGGER_PENDING
                working = WorkingOrderType.NONE
            elif type_e == OrderType.MARKET:
                status = OrderStatus.OPEN
                working = WorkingOrderType.MARKET
            else:
                status = OrderStatus.OPEN
                working = WorkingOrderType.LIMIT

            order = PaperOrder(
                id=uuid4(),
                user_id=user_id,
                instrument_key=instrument_key,
                trading_symbol=trading_symbol,
                side=side_e,
                order_type=type_e,
                working_order_type=working,
                product=product_e,
                qty=qty,
                filled_qty=0,
                price=px,
                trigger_price=tpx,
                status=status,
                close_lot_id=close_id,
                source=source,
                client_order_id=client_id,
                accept_seq=accept_seq,
                accepted_at=now,
                accepted_tick_ms=int(ltp and self._ltp.get(instrument_key).timestamp_ms or 0)
                if ltp
                else None,
                created_at=now,
                updated_at=now,
                market_ready_after_seq=seen if working == WorkingOrderType.MARKET else 0,
                warmup_required=False,
            )
            self._orders[order.id] = order
            if order.status in OPEN_STATUSES:
                self._open_by_symbol.setdefault(instrument_key, set()).add(order.id)

            if intent in (Intent.OPEN_LONG, Intent.OPEN_SHORT) and lock_px is not None:
                need = required_order_lock_amount(intent, qty, lock_px)
                if need > 0:
                    acc.locks.append(
                        CashLock(
                            id=uuid4(),
                            user_id=user_id,
                            amount=need,
                            reason=LockReason.ORDER,
                            order_id=order.id,
                            created_at=now,
                        )
                    )

            self._persist_order(order)
            self._persist_account(acc)
            return self._order_dto(order)

    def cancel_order(self, user_id: UUID, order_id: UUID, *, reason: str = "USER_CANCEL") -> dict:
        self._require_enabled()
        with self._user_lock(user_id):
            order = self._orders.get(order_id)
            if order is None or order.user_id != user_id:
                raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Order not found"})
            if order.status not in OPEN_STATUSES:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "NOT_CANCELLABLE", "message": f"status={order.status}"},
                )
            now = datetime.now(timezone.utc)
            order.status = OrderStatus.CANCELLED if reason == "USER_CANCEL" else OrderStatus.EXPIRED
            order.reject_reason = reason
            order.completed_at = now
            order.updated_at = now
            release_order_lock(self._account(user_id), order.id, now)
            self._open_by_symbol.get(order.instrument_key, set()).discard(order.id)
            self._persist_order(order)
            self._persist_account(self._account(user_id))
            return self._order_dto(order)

    def modify_order(
        self,
        user_id: UUID,
        order_id: UUID,
        *,
        qty: int | None = None,
        price: float | None = None,
        trigger_price: float | None = None,
    ) -> dict:
        self._require_enabled()
        with self._user_lock(user_id):
            order = self._orders.get(order_id)
            if order is None or order.user_id != user_id:
                raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Order not found"})
            entry = self._watchlist.find_by_symbol_id(order.instrument_key)
            self._require_user_session_open(entry)
            if order.status not in OPEN_STATUSES:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "NOT_MODIFIABLE", "message": f"status={order.status}"},
                )
            if qty is not None:
                if qty < 1 or qty < order.filled_qty:
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "INVALID_QTY", "message": "qty must be >= filledQty and >= 1"},
                    )
                order.qty = qty
            if price is not None:
                if order.order_type == OrderType.MARKET or (
                    order.order_type == OrderType.SL_M and order.triggered_at is None
                ):
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "PRICE_NOT_ALLOWED", "message": "price not valid for type"},
                    )
                order.price = Decimal(str(price))
            if trigger_price is not None:
                if order.order_type not in (OrderType.SL, OrderType.SL_M):
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "TRIGGER_NOT_ALLOWED", "message": "trigger only for SL"},
                    )
                order.trigger_price = Decimal(str(trigger_price))
            self._validate_prices(order.order_type, order.price, order.trigger_price)

            acc = self._account(user_id)
            intent = resolve_intent(order)
            haircut = Decimal(str(getattr(self._settings, "paper_market_lock_haircut", 1.02)))
            ltp = self._ltp.get_price(order.instrument_key)
            lock_px = lock_reference_price(order.order_type, order.price, ltp, haircut) or Decimal("0")
            if intent in (Intent.OPEN_LONG, Intent.OPEN_SHORT):
                # temporary release and re-lock
                now = datetime.now(timezone.utc)
                old = acc.order_lock(order.id)
                old_amt = old.amount if old else money(0)
                if old:
                    old.released_at = now
                need = required_order_lock_amount(intent, order.remaining, lock_px)
                if need > acc.free_cash():
                    # restore old
                    if old:
                        old.released_at = None
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "INSUFFICIENT_CASH", "message": "Cannot increase lock"},
                    )
                if need > 0:
                    acc.locks.append(
                        CashLock(
                            id=uuid4(),
                            user_id=user_id,
                            amount=need,
                            reason=LockReason.ORDER,
                            order_id=order.id,
                            created_at=now,
                        )
                    )
            order.updated_at = datetime.now(timezone.utc)
            order.version += 1
            self._persist_order(order)
            self._persist_account(acc)
            return self._order_dto(order)

    # --- queries ---

    def list_orders(self, user_id: UUID, *, status: str | None = None, limit: int = 100) -> list[dict]:
        self._require_enabled()
        rows = [o for o in self._orders.values() if o.user_id == user_id]
        if status:
            rows = [o for o in rows if o.status.value == status.upper()]
        rows.sort(key=lambda o: o.created_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        return [self._order_dto(o) for o in rows[:limit]]

    def get_order(self, user_id: UUID, order_id: UUID) -> dict:
        self._require_enabled()
        o = self._orders.get(order_id)
        if o is None or o.user_id != user_id:
            raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Order not found"})
        return self._order_dto(o)

    def list_positions(self, user_id: UUID, *, open_only: bool = True) -> list[dict]:
        self._require_enabled()
        lots = [L for L in self._lots.values() if L.user_id == user_id]
        if open_only:
            lots = [L for L in lots if L.status == LotStatus.OPEN]
        lots.sort(key=lambda L: L.opened_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        return [self._lot_dto(L) for L in lots]

    def list_fills(self, user_id: UUID, *, limit: int = 100) -> list[dict]:
        self._require_enabled()
        rows = [f for f in self._fills if f.user_id == user_id]
        rows.sort(key=lambda f: f.created_at, reverse=True)
        return [self._fill_dto(f) for f in rows[:limit]]

    def account_snapshot(self, user_id: UUID) -> dict:
        self._require_enabled()
        with self._user_lock(user_id):
            acc = self._account(user_id)
            return {
                "cashBalance": float(acc.cash_balance),
                "lockedCash": float(acc.locked_cash()),
                "freeCash": float(acc.free_cash()),
            }

    def list_ledger(self, user_id: UUID, *, limit: int = 100) -> list[dict]:
        self._require_enabled()
        acc = self._account(user_id)
        entries = list(reversed(acc.ledger[-limit:]))
        return [
            {
                "entryType": e.entry_type,
                "amount": float(e.amount),
                "balanceAfter": float(e.balance_after),
                "note": e.note,
            }
            for e in entries
        ]

    def preview_charges(
        self,
        user_id: UUID,
        *,
        instrument_key: str,
        side: str,
        order_type: str,
        product: str,
        qty: int,
        price: float | None = None,
        close_lot_id: str | None = None,
    ) -> dict:
        """Read-only charge/lock estimate. Does not move cash or place an order."""
        self._require_enabled()
        if qty < 1:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_QTY", "message": "qty must be >= 1"},
            )
        try:
            side_e = Side(str(side).upper())
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_SIDE", "message": "side must be BUY or SELL"},
            ) from None
        try:
            product_e = Product(str(product).upper())
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_PRODUCT", "message": "product must be MIS or CNC"},
            ) from None
        type_e = self._parse_order_type(order_type)

        close_raw = (close_lot_id or "").strip() or None
        close_id: UUID | None = None
        if close_raw:
            try:
                close_id = UUID(close_raw)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "LOT_NOT_FOUND", "message": "closeLotId invalid"},
                ) from None

        if product_e == Product.CNC and side_e == Side.SELL and close_id is None:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "CNC_SHORT_NOT_ALLOWED",
                    "message": "CNC cannot open a short; sell CNC only to close a delivery long",
                },
            )

        body_px = Decimal(str(price)) if price is not None else None
        if body_px is not None and body_px <= 0:
            body_px = None
        ltp = self._ltp.get_price(instrument_key)
        charge_px = self._preview_charge_price(type_e, body_px, ltp)

        with self._user_lock(user_id):
            lot = None
            if close_id is not None:
                lot = self._lots.get(close_id)
                if lot is None or lot.user_id != user_id or lot.status != LotStatus.OPEN:
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "LOT_NOT_FOUND", "message": "closeLotId invalid"},
                    )
                if lot.side == LotSide.LONG and side_e != Side.SELL:
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "SIDE_MISMATCH", "message": "close long with SELL"},
                    )
                if lot.side == LotSide.SHORT and side_e != Side.BUY:
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "SIDE_MISMATCH", "message": "cover short with BUY"},
                    )
            intent = (
                Intent.OPEN_LONG
                if close_id is None and side_e == Side.BUY
                else Intent.OPEN_SHORT
                if close_id is None
                else Intent.COVER_SHORT
                if side_e == Side.BUY
                else Intent.CLOSE_LONG
            )
            if intent == Intent.COVER_SHORT and lot is None:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "LOT_NOT_FOUND", "message": "closeLotId invalid"},
                )

            enabled = bool(getattr(self._settings, "paper_charges_enabled", False))
            notional = money(Decimal(qty) * charge_px)
            bd = compute_charges(
                ChargeContext(
                    side=side_e,
                    product=product_e,
                    intent=intent,
                    qty=qty,
                    price=charge_px,
                    notional=notional,
                ),
                self._charge_schedule,
                enabled=enabled,
            )
            cash_effect = self._preview_cash_effect(intent, notional, bd.total, lot, charge_px, qty)

            haircut = Decimal(str(getattr(self._settings, "paper_market_lock_haircut", 1.02)))
            lock_px = lock_reference_price(type_e, body_px, ltp, haircut)
            if intent in (Intent.CLOSE_LONG, Intent.COVER_SHORT):
                lock_estimate = money(0)
            else:
                if type_e in (OrderType.MARKET, OrderType.SL_M) and (ltp is None or ltp <= 0):
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "NO_LTP", "message": "No LTP for lock sizing"},
                    )
                if lock_px is None or lock_px <= 0:
                    raise HTTPException(
                        status_code=400,
                        detail={"code": "NO_LTP", "message": "No LTP for lock sizing"},
                    )
                lock_notional = money(Decimal(qty) * lock_px)
                lock_bd = compute_charges(
                    ChargeContext(
                        side=side_e,
                        product=product_e,
                        intent=intent,
                        qty=qty,
                        price=lock_px,
                        notional=lock_notional,
                    ),
                    self._charge_schedule,
                    enabled=enabled,
                )
                lock_estimate = money(lock_notional + lock_bd.total)

            return {
                "enabled": enabled,
                "scheduleId": bd.schedule_id,
                "notional": float(notional),
                "charges": [
                    {"code": ln.code.value, "amount": float(ln.amount)}
                    for ln in bd.persistable_lines()
                ],
                "chargesTotal": float(bd.total),
                "cashEffect": float(cash_effect),
                "lockEstimate": float(lock_estimate),
                "lockPrice": float(lock_px) if lock_px is not None else None,
                # place_order still locks notional only.
                "lockIncludesCharges": False,
            }

    def wipe_user(self, user_id: UUID, *, close_price_policy: str = "LTP_ELSE_ENTRY") -> None:
        """Cancel orders, force-close lots, release locks. Does not reset cash_balance."""
        if not self.enabled:
            return
        with self._user_lock(user_id):
            now = datetime.now(timezone.utc)
            acc = self._account(user_id)
            for o in list(self._orders.values()):
                if o.user_id == user_id and o.status in OPEN_STATUSES:
                    o.status = OrderStatus.CANCELLED
                    o.reject_reason = "ADMIN_WIPE"
                    o.completed_at = now
                    o.updated_at = now
                    self._open_by_symbol.get(o.instrument_key, set()).discard(o.id)
                    release_order_lock(acc, o.id, now)
                    self._persist_order(o)
            for L in list(self._lots.values()):
                if L.user_id == user_id and L.status == LotStatus.OPEN:
                    px = self._ltp.get_price(L.instrument_key) or L.avg_entry_price
                    self._force_close_lot(acc, L, Decimal(str(px)), now, reason="ADMIN_WIPE")
            for lk in acc.open_locks():
                lk.released_at = now
            self._persist_account(acc)

    # --- matching ---

    def _on_drain(self, batch: dict[str, Tick]) -> None:
        for key, tick in batch.items():
            self._process_symbol_tick(tick)

    def _process_symbol_tick(self, tick: Tick) -> None:
        key = tick.instrument_key
        price = Decimal(str(tick.price))
        with self._global:
            self._seen_tick_seq[key] = self._seen_tick_seq.get(key, 0) + 1
            seq = self._seen_tick_seq[key]
            # clear warmup on first post-rebuild tick
            for oid in list(self._open_by_symbol.get(key, set())):
                o = self._orders.get(oid)
                if o and o.warmup_required:
                    o.warmup_required = False
                    o.market_ready_after_seq = seq  # fill from next tick

        order_ids = list(self._open_by_symbol.get(key, set()))
        by_user: dict[UUID, list[UUID]] = {}
        for oid in order_ids:
            o = self._orders.get(oid)
            if o is None:
                continue
            by_user.setdefault(o.user_id, []).append(oid)

        for user_id, oids in by_user.items():
            with self._user_lock(user_id):
                for oid in oids:
                    order = self._orders.get(oid)
                    if order is None or order.status not in OPEN_STATUSES:
                        continue
                    try:
                        self._match_one(order, price, int(tick.timestamp_ms), seq)
                    except Exception:
                        logger.exception("match failed order=%s", oid)

    def _match_one(self, order: PaperOrder, price: Decimal, tick_ts_ms: int, seen_seq: int) -> None:
        now = datetime.now(timezone.utc)
        # Stop activation
        if should_activate_stop(order, price):
            order.triggered_at = now
            if order.order_type == OrderType.SL:
                order.working_order_type = WorkingOrderType.LIMIT
                order.status = OrderStatus.OPEN
            else:
                order.working_order_type = WorkingOrderType.MARKET
                order.status = OrderStatus.OPEN
                order.market_ready_after_seq = seen_seq  # same-tick allowed for SL_M via flag
            order.updated_at = now

        working = order.working_order_type
        fill_now = False
        same_tick = False
        if working == WorkingOrderType.MARKET:
            same_tick = order.order_type == OrderType.SL_M and order.triggered_at is not None
            fill_now = market_fill_allowed(order, seen_seq, same_tick_ok=same_tick)
            if same_tick and order.triggered_at is not None:
                # same trigger tick: allow if seq >= market_ready (set to seen_seq above)
                fill_now = True
        elif working == WorkingOrderType.LIMIT:
            fill_now = is_limit_marketable(order, price)
        if not fill_now:
            self._persist_order(order)
            return

        max_pt = getattr(self._settings, "paper_max_fill_qty_per_tick", None)
        attempt = attempt_fill_qty(order, int(max_pt) if max_pt else None)
        if attempt <= 0:
            return

        acc = self._account(order.user_id)
        lot: PositionLot | None = None
        intent = resolve_intent(order)
        if order.close_lot_id:
            lot = self._lots.get(order.close_lot_id)
            if lot is None or lot.status != LotStatus.OPEN:
                order.status = OrderStatus.EXPIRED
                order.reject_reason = "LOT_GONE"
                order.completed_at = now
                release_order_lock(acc, order.id, now)
                self._open_by_symbol.get(order.instrument_key, set()).discard(order.id)
                self._persist_order(order)
                return

        # open long funding cap
        cancel_mkt = order.working_order_type == WorkingOrderType.MARKET
        result = apply_fill_cash(
            acc,
            order,
            lot,
            attempt,
            price,
            now,
            cancel_unfunded_market=cancel_mkt,
        )
        if result.fill_qty <= 0:
            if result.cancel_residual:
                order.status = OrderStatus.EXPIRED
                order.reject_reason = result.cancel_reason
                order.completed_at = now
                release_order_lock(acc, order.id, now)
                self._open_by_symbol.get(order.instrument_key, set()).discard(order.id)
            self._persist_order(order)
            self._persist_account(acc)
            return

        fq = result.fill_qty
        # update lot
        lot = self._apply_lot_fill(order, lot, fq, price, now)
        if intent == Intent.OPEN_SHORT and lot is not None:
            ensure_short_margin(
                acc,
                lot,
                money(Decimal(lot.qty_open) * Decimal(str(lot.avg_entry_price))),
                now,
            )

        order.filled_qty += fq
        if order.filled_qty >= order.qty:
            order.status = OrderStatus.FILLED
            order.completed_at = now
            release_order_lock(acc, order.id, now)
            self._open_by_symbol.get(order.instrument_key, set()).discard(order.id)
        else:
            order.status = OrderStatus.PARTIALLY_FILLED
            if result.cancel_residual:
                order.status = OrderStatus.EXPIRED
                order.reject_reason = result.cancel_reason
                order.completed_at = now
                release_order_lock(acc, order.id, now)
                self._open_by_symbol.get(order.instrument_key, set()).discard(order.id)
            else:
                # recompute lock
                haircut = Decimal(str(getattr(self._settings, "paper_market_lock_haircut", 1.02)))
                ltp = price
                lock_px = lock_reference_price(order.order_type, order.price, ltp, haircut)
                if lock_px and resolve_intent(order) in (Intent.OPEN_LONG, Intent.OPEN_SHORT):
                    recompute_order_lock(acc, order, lock_px, now)

        fill = PaperFill(
            id=uuid4(),
            order_id=order.id,
            user_id=order.user_id,
            instrument_key=order.instrument_key,
            side=order.side,
            qty=fq,
            price=price,
            amount=money(Decimal(fq) * price),
            tick_ts_ms=tick_ts_ms,
            lot_id=lot.id if lot else None,
            created_at=now,
        )
        self._fills.append(fill)
        order.updated_at = now
        order.version += 1
        self._persist_order(order)
        self._persist_fill(fill)
        self._persist_account(acc)
        if lot:
            self._persist_lot(lot)
            if lot.status == LotStatus.CLOSED:
                self._cancel_orders_for_closed_lot(
                    order.user_id, lot, reason="LOT_CLOSED", now=now
                )
        self._write_user_cash(order.user_id, acc)

    def _cancel_orders_for_closed_lot(
        self,
        user_id: UUID,
        lot: PositionLot,
        *,
        reason: str = "LOT_CLOSED",
        now: datetime | None = None,
    ) -> None:
        """Expire open orders linked to a fully closed lot (and orphan protective stops).

        Primary: any open order with close_lot_id == lot.id.
        Secondary: open SL/SL_M on same instrument+product, opposite side, no
        close_lot_id, when no remaining open lot remains for that side.
        """
        if lot is None or lot.status != LotStatus.CLOSED:
            return
        ts = now or datetime.now(timezone.utc)
        acc = self._account(user_id)

        has_same_side_open = any(
            L.user_id == user_id
            and L.status == LotStatus.OPEN
            and L.instrument_key == lot.instrument_key
            and L.product == lot.product
            and L.side == lot.side
            and L.id != lot.id
            for L in self._lots.values()
        )
        protective_side = Side.SELL if lot.side == LotSide.LONG else Side.BUY

        for o in list(self._orders.values()):
            if o.user_id != user_id or o.status not in OPEN_STATUSES:
                continue
            linked = o.close_lot_id is not None and o.close_lot_id == lot.id
            orphan_stop = (
                not linked
                and not has_same_side_open
                and o.close_lot_id is None
                and o.order_type in (OrderType.SL, OrderType.SL_M)
                and o.instrument_key == lot.instrument_key
                and o.product == lot.product
                and o.side == protective_side
            )
            if not linked and not orphan_stop:
                continue
            o.status = OrderStatus.EXPIRED
            o.reject_reason = reason
            o.completed_at = ts
            o.updated_at = ts
            release_order_lock(acc, o.id, ts)
            self._open_by_symbol.get(o.instrument_key, set()).discard(o.id)
            self._persist_order(o)
        self._persist_account(acc)

    def _apply_lot_fill(
        self,
        order: PaperOrder,
        lot: PositionLot | None,
        fill_qty: int,
        price: Decimal,
        now: datetime,
    ) -> PositionLot:
        intent = resolve_intent(order)
        if intent in (Intent.OPEN_LONG, Intent.OPEN_SHORT):
            if lot is None:
                # find existing lot for same entry order
                for L in self._lots.values():
                    if L.entry_order_id == order.id and L.status == LotStatus.OPEN:
                        lot = L
                        break
            if lot is None:
                lot = PositionLot(
                    id=uuid4(),
                    user_id=order.user_id,
                    instrument_key=order.instrument_key,
                    trading_symbol=order.trading_symbol,
                    side=LotSide.LONG if intent == Intent.OPEN_LONG else LotSide.SHORT,
                    product=order.product,
                    qty_open=fill_qty,
                    qty_closed=0,
                    avg_entry_price=price,
                    realized_pnl=money(0),
                    status=LotStatus.OPEN,
                    entry_order_id=order.id,
                    opened_at=now,
                    updated_at=now,
                )
                self._lots[lot.id] = lot
            else:
                # VWAP
                old_n = Decimal(lot.qty_open) * Decimal(str(lot.avg_entry_price))
                new_n = old_n + Decimal(fill_qty) * price
                lot.qty_open += fill_qty
                lot.avg_entry_price = Decimal(str(new_n / Decimal(lot.qty_open)))
                lot.updated_at = now
            return lot

        assert lot is not None
        # close / cover
        if intent == Intent.CLOSE_LONG:
            pnl = money((price - Decimal(str(lot.avg_entry_price))) * Decimal(fill_qty))
        else:
            pnl = money((Decimal(str(lot.avg_entry_price)) - price) * Decimal(fill_qty))
        lot.qty_open -= fill_qty
        lot.qty_closed += fill_qty
        lot.realized_pnl = money(lot.realized_pnl + pnl)
        lot.updated_at = now
        if lot.qty_open <= 0:
            lot.qty_open = 0
            lot.status = LotStatus.CLOSED
            lot.closed_at = now
        return lot

    def _force_close_lot(
        self, acc: CashAccount, lot: PositionLot, price: Decimal, now: datetime, reason: str
    ) -> None:
        if lot.qty_open <= 0:
            lot.status = LotStatus.CLOSED
            lot.closed_at = now
            return
        fq = lot.qty_open
        side = Side.SELL if lot.side == LotSide.LONG else Side.BUY
        # filled_qty stays 0 / OPEN so apply_fill_cash remaining-based lock math is non-zero.
        order = PaperOrder(
            id=uuid4(),
            user_id=lot.user_id,
            instrument_key=lot.instrument_key,
            trading_symbol=lot.trading_symbol,
            side=side,
            order_type=OrderType.MARKET,
            working_order_type=WorkingOrderType.MARKET,
            product=lot.product,
            qty=fq,
            filled_qty=0,
            status=OrderStatus.OPEN,
            reject_reason=reason or None,
            close_lot_id=lot.id,
            source=OrderSource.SYSTEM_SQUARE_OFF,
            accept_seq=self._next_accept_seq(),
            accepted_at=now,
            created_at=now,
            updated_at=now,
        )
        result = apply_fill_cash(
            acc,
            order,
            lot,
            fq,
            price,
            now,
            cancel_unfunded_market=False,
        )
        if result.fill_qty <= 0:
            logger.warning("force-close fill_qty=0 lot=%s reason=%s", lot.id, reason)
            return
        fq = result.fill_qty
        lot = self._apply_lot_fill(order, lot, fq, price, now)
        order.filled_qty = fq
        order.status = OrderStatus.FILLED
        order.completed_at = now
        order.updated_at = now
        order.version += 1
        self._orders[order.id] = order
        fill = PaperFill(
            id=uuid4(),
            order_id=order.id,
            user_id=order.user_id,
            instrument_key=order.instrument_key,
            side=order.side,
            qty=fq,
            price=price,
            amount=money(Decimal(fq) * price),
            tick_ts_ms=int(now.timestamp() * 1000),
            lot_id=lot.id,
            created_at=now,
            charges_total=money(0),
            schedule_id="off",
        )
        self._fills.append(fill)
        self._persist_order(order)
        self._persist_fill(fill)
        self._persist_lot(lot)
        self._persist_account(acc)
        if lot.status == LotStatus.CLOSED:
            self._cancel_orders_for_closed_lot(
                lot.user_id, lot, reason=reason or "LOT_CLOSED", now=now
            )
        self._write_user_cash(lot.user_id, acc)

    # --- MIS square-off ---

    def maybe_mis_square_off(self) -> None:
        if not self.enabled:
            return
        now_ist = datetime.now(tz=NSE_ZONE)
        if phase_from_clock() == MarketPhase.PRE_OPEN:
            return
        d = now_ist.date()
        cas_on = bool(getattr(self._settings, "cas_session_enabled", True))
        if not cas_on:
            so_t = self._parse_hhmm(
                getattr(self._settings, "paper_mis_square_off", "15:20"), 15, 20
            )
            if now_ist.time() < so_t:
                return
            if d in self._square_off_dates:
                if phase_from_clock() == MarketPhase.CLOSED:
                    self._force_remaining_mis(d)
                return
            self._run_mis_square_off(d)
            return

        cas_t = self._parse_hhmm(
            getattr(self._settings, "paper_mis_square_off_cas", "15:10"), 15, 10
        )
        cash_t = self._parse_hhmm(
            getattr(self._settings, "paper_mis_square_off", "15:20"), 15, 20
        )
        if now_ist.time() >= cas_t and (d, SessionKind.CAS_CASH.value) not in self._square_off_ran:
            self._run_mis_square_off(d, kinds={SessionKind.CAS_CASH})
        if now_ist.time() >= time(15, 15) and d not in self._cts_sl_cancelled:
            self._cancel_cas_stops(d)
            self._force_remaining_mis(d, kinds={SessionKind.CAS_CASH})
            self._cts_sl_cancelled.add(d)
        if now_ist.time() >= cash_t and (d, SessionKind.CASH.value) not in self._square_off_ran:
            self._run_mis_square_off(d, kinds={SessionKind.CASH})
        if phase_from_clock() == MarketPhase.CLOSED:
            # Leftover MIS (any kind) + every remaining CNC, including CAS limits
            # that survived 15:15 (only SL/SL_M are cancelled at CTS).
            self._force_remaining_mis(d)

    def _kind_for_key(self, instrument_key: str) -> SessionKind:
        entry = self._watchlist.find_by_symbol_id(instrument_key)
        if entry is not None:
            return session_kind_from_entry(entry)
        return SessionKind.CASH

    def _matches_kinds(self, instrument_key: str, kinds: set[SessionKind] | None) -> bool:
        if kinds is None:
            return True
        return self._kind_for_key(instrument_key) in kinds

    def _run_mis_square_off(
        self, trade_date: date, kinds: set[SessionKind] | None = None
    ) -> None:
        kind_label = ",".join(sorted(k.value for k in kinds)) if kinds else "all"
        logger.info("MIS square-off starting for %s kind=%s", trade_date, kind_label)
        for o in list(self._orders.values()):
            if o.product != Product.MIS or o.status not in OPEN_STATUSES:
                continue
            if not self._matches_kinds(o.instrument_key, kinds):
                continue
            try:
                self.cancel_order(o.user_id, o.id, reason="MIS_SQUARE_OFF")
            except Exception:
                logger.exception("cancel MIS order %s", o.id)
        for L in list(self._lots.values()):
            if L.product != Product.MIS or L.status != LotStatus.OPEN:
                continue
            if not self._matches_kinds(L.instrument_key, kinds):
                continue
            side = "SELL" if L.side == LotSide.LONG else "BUY"
            try:
                self.place_order(
                    L.user_id,
                    instrument_key=L.instrument_key,
                    side=side,
                    order_type="MARKET",
                    product="MIS",
                    qty=L.qty_open,
                    close_lot_id=str(L.id),
                    trading_enabled=True,
                    source=OrderSource.SYSTEM_SQUARE_OFF,
                )
            except Exception:
                logger.exception("square-off place failed lot=%s", L.id)
        if kinds is None:
            self._square_off_dates.add(trade_date)
        else:
            for k in kinds:
                self._square_off_ran.add((trade_date, k.value))
            if SessionKind.CASH in kinds:
                self._square_off_dates.add(trade_date)

    def _cancel_cas_stops(self, trade_date: date) -> None:
        for o in list(self._orders.values()):
            if o.status not in OPEN_STATUSES:
                continue
            if o.order_type not in (OrderType.SL, OrderType.SL_M):
                continue
            if self._kind_for_key(o.instrument_key) != SessionKind.CAS_CASH:
                continue
            try:
                self.cancel_order(o.user_id, o.id, reason="CTS_END")
            except Exception:
                logger.exception("CAS CTS SL cancel failed %s", o.id)

    def _force_remaining_mis(
        self, trade_date: date, kinds: set[SessionKind] | None = None
    ) -> None:
        now = datetime.now(timezone.utc)
        for L in list(self._lots.values()):
            if L.product != Product.MIS or L.status != LotStatus.OPEN:
                continue
            if not self._matches_kinds(L.instrument_key, kinds):
                continue
            with self._user_lock(L.user_id):
                acc = self._account(L.user_id)
                px = self._ltp.get_price(L.instrument_key) or L.avg_entry_price
                self._force_close_lot(acc, L, Decimal(str(px)), now, reason="MIS_FORCE_CLOSED")
                self._persist_lot(L)
                self._persist_account(acc)
        # CNC SESSION_END is a full-session event (15:30 / flag-off), not CTS.
        if kinds is not None:
            return
        for o in list(self._orders.values()):
            if o.status in OPEN_STATUSES and o.product == Product.CNC:
                try:
                    self.cancel_order(o.user_id, o.id, reason="SESSION_END")
                except Exception:
                    pass

    # --- helpers ---

    @staticmethod
    def _parse_hhmm(raw: str, default_h: int, default_m: int) -> time:
        try:
            hh, mm = str(raw).split(":")
            return time(int(hh), int(mm))
        except Exception:
            return time(default_h, default_m)

    def _require_user_session_open(self, entry) -> None:
        if phase_from_clock() != MarketPhase.OPEN:
            raise HTTPException(
                status_code=400,
                detail={"code": "MARKET_CLOSED", "message": "Orders only during market OPEN"},
            )
        cas_on = bool(getattr(self._settings, "cas_session_enabled", True))
        kind = session_kind_from_entry(entry) if entry is not None else SessionKind.CASH
        close = cts_close_minutes(kind, cas_enabled=cas_on)
        if phase_at(datetime.now(tz=NSE_ZONE), close_minutes=close) != MarketPhase.OPEN:
            raise HTTPException(
                status_code=400,
                detail={"code": "MARKET_CLOSED", "message": "Orders only during market OPEN"},
            )

    def _require_enabled(self) -> None:
        if not self.enabled:
            raise HTTPException(
                status_code=503,
                detail={"code": "PAPER_DISABLED", "message": "Paper trading disabled"},
            )
        # Design: requires postgres for production durability; allow in-memory if no SF for tests
        if self._sf is None and not getattr(self._settings, "paper_allow_memory", False):
            if not getattr(self._settings, "is_memory_profile", False):
                # still allow if paper_allow_memory default false — for local postgres-less, enable via setting
                pass  # in-process book always works; PG optional write-through

    @staticmethod
    def _parse_order_type(order_type: str) -> OrderType:
        ot_raw = str(order_type or "").upper().replace("-", "_")
        if ot_raw in ("SLM", "SL_M"):
            return OrderType.SL_M
        try:
            return OrderType(ot_raw)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "INVALID_ORDER_TYPE",
                    "message": "orderType must be MARKET|LIMIT|SL|SL_M",
                },
            ) from None

    @staticmethod
    def _preview_charge_price(
        order_type: OrderType, body_px: Decimal | None, ltp: Decimal | None
    ) -> Decimal:
        if order_type in (OrderType.LIMIT, OrderType.SL):
            if body_px is None:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "INVALID_PRICES", "message": "LIMIT/SL requires price"},
                )
            return body_px
        # MARKET / SL_M: body price if present else LTP
        if body_px is not None:
            return body_px
        if ltp is None or ltp <= 0:
            raise HTTPException(
                status_code=400,
                detail={"code": "NO_LTP", "message": "No LTP for lock sizing"},
            )
        return ltp

    @staticmethod
    def _preview_cash_effect(
        intent: Intent,
        notional: Decimal,
        charges_total: Decimal,
        lot: PositionLot | None,
        charge_px: Decimal,
        qty: int,
    ) -> Decimal:
        if intent == Intent.OPEN_LONG:
            return money(-(notional + charges_total))
        if intent == Intent.CLOSE_LONG:
            return money(notional - charges_total)
        if intent == Intent.OPEN_SHORT:
            return money(-charges_total)
        # COVER_SHORT: PnL vs lot entry, then charges (margin is lock, not cashEffect)
        if lot is None:
            raise HTTPException(
                status_code=400,
                detail={"code": "LOT_NOT_FOUND", "message": "closeLotId invalid"},
            )
        pnl = money((Decimal(str(lot.avg_entry_price)) - charge_px) * Decimal(qty))
        return money(pnl - charges_total)

    def _validate_prices(
        self, order_type: OrderType, price: Decimal | None, trigger: Decimal | None
    ) -> None:
        if order_type == OrderType.MARKET:
            if price is not None or trigger is not None:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "INVALID_PRICES", "message": "MARKET has no price/trigger"},
                )
        elif order_type == OrderType.LIMIT:
            if price is None or price <= 0:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "INVALID_PRICES", "message": "LIMIT requires price"},
                )
            if trigger is not None:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "INVALID_PRICES", "message": "LIMIT has no trigger"},
                )
        elif order_type == OrderType.SL:
            if price is None or trigger is None:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "INVALID_PRICES", "message": "SL requires price and trigger"},
                )
            # bands checked with side at place — need side; skip or check in place
        elif order_type == OrderType.SL_M:
            if trigger is None or trigger <= 0:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "INVALID_PRICES", "message": "SL_M requires trigger"},
                )
            if price is not None:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "INVALID_PRICES", "message": "SL_M must not have price"},
                )

    def _order_dto(self, o: PaperOrder) -> dict:
        return {
            "id": str(o.id),
            "userId": str(o.user_id),
            "clientOrderId": o.client_order_id,
            "instrumentKey": o.instrument_key,
            "tradingSymbol": o.trading_symbol,
            "side": o.side.value,
            "orderType": o.order_type.value,
            "workingOrderType": o.working_order_type.value,
            "product": o.product.value,
            "qty": o.qty,
            "filledQty": o.filled_qty,
            "price": float(o.price) if o.price is not None else None,
            "triggerPrice": float(o.trigger_price) if o.trigger_price is not None else None,
            "status": o.status.value,
            "rejectReason": o.reject_reason,
            "closeLotId": str(o.close_lot_id) if o.close_lot_id else None,
            "source": o.source.value,
            "acceptSeq": o.accept_seq,
            "acceptedAt": o.accepted_at.isoformat() if o.accepted_at else None,
            "triggeredAt": o.triggered_at.isoformat() if o.triggered_at else None,
            "completedAt": o.completed_at.isoformat() if o.completed_at else None,
            "createdAt": o.created_at.isoformat() if o.created_at else None,
            "updatedAt": o.updated_at.isoformat() if o.updated_at else None,
        }

    def _lot_dto(self, L: PositionLot) -> dict:
        ltp = self._ltp.get_price(L.instrument_key)
        mtm = None
        if ltp is not None and L.qty_open > 0:
            if L.side == LotSide.LONG:
                mtm = float(money((ltp - Decimal(str(L.avg_entry_price))) * Decimal(L.qty_open)))
            else:
                mtm = float(money((Decimal(str(L.avg_entry_price)) - ltp) * Decimal(L.qty_open)))
        return {
            "id": str(L.id),
            "userId": str(L.user_id),
            "instrumentKey": L.instrument_key,
            "tradingSymbol": L.trading_symbol,
            "side": L.side.value,
            "product": L.product.value,
            "qtyOpen": L.qty_open,
            "qtyClosed": L.qty_closed,
            "avgEntryPrice": float(L.avg_entry_price),
            "realizedPnl": float(L.realized_pnl),
            "unrealizedPnl": mtm,
            "ltp": float(ltp) if ltp is not None else None,
            "status": L.status.value,
            "entryOrderId": str(L.entry_order_id) if L.entry_order_id else None,
            "openedAt": L.opened_at.isoformat() if L.opened_at else None,
            "closedAt": L.closed_at.isoformat() if L.closed_at else None,
        }

    def _fill_dto(self, f: PaperFill) -> dict:
        return {
            "id": str(f.id),
            "orderId": str(f.order_id),
            "userId": str(f.user_id),
            "instrumentKey": f.instrument_key,
            "side": f.side.value,
            "qty": f.qty,
            "price": float(f.price),
            "amount": float(f.amount),
            "tickTsMs": f.tick_ts_ms,
            "lotId": str(f.lot_id) if f.lot_id else None,
            "createdAt": f.created_at.isoformat(),
        }

    def _write_user_cash(self, user_id: UUID, acc: CashAccount) -> None:
        if self._user_cash_writer:
            unpublished = list(acc.ledger[acc.ledger_published_thru :])
            try:
                self._user_cash_writer(user_id, acc.cash_balance, unpublished)
                acc.ledger_published_thru = len(acc.ledger)
            except Exception:
                logger.exception("user cash writer failed")

    def _persist_order(self, order: PaperOrder) -> None:
        if self._sf is None:
            return
        try:
            from app.paper.repository import upsert_order

            upsert_order(self._sf, order)
        except Exception:
            logger.exception("persist order failed")

    def _persist_fill(self, fill: PaperFill) -> None:
        if self._sf is None:
            return
        try:
            from app.paper.repository import insert_fill

            insert_fill(self._sf, fill)
        except Exception:
            logger.exception("persist fill failed")

    def _persist_lot(self, lot: PositionLot) -> None:
        if self._sf is None:
            return
        try:
            from app.paper.repository import upsert_lot

            upsert_lot(self._sf, lot)
        except Exception:
            logger.exception("persist lot failed")

    def _persist_account(self, acc: CashAccount) -> None:
        if self._sf is None:
            return
        try:
            from app.paper.repository import sync_locks

            sync_locks(self._sf, acc)
        except Exception:
            logger.exception("persist locks failed")

    def _load_from_db(self) -> None:
        from app.paper.repository import load_book

        book = load_book(self._sf)
        self._orders = book["orders"]
        self._lots = book["lots"]
        self._fills = book["fills"]
        # rebuild indexes
        self._open_by_symbol.clear()
        max_seq = 0
        for o in self._orders.values():
            max_seq = max(max_seq, o.accept_seq)
            if o.status in OPEN_STATUSES:
                self._open_by_symbol.setdefault(o.instrument_key, set()).add(o.id)
                o.warmup_required = True
                o.market_ready_after_seq = 0
        self._accept_seq = max_seq
        for user_id, locks in book["locks_by_user"].items():
            acc = self._account(user_id)
            acc.locks = locks
        logger.info(
            "Paper book loaded: orders=%s lots=%s fills=%s",
            len(self._orders),
            len(self._lots),
            len(self._fills),
        )

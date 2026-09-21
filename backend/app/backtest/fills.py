"""Bar-based fill simulator. Stop wins if stop and target both print in the bar."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import time
from decimal import Decimal
from uuid import UUID, uuid4

from app.market.models import Candle
from app.paper.charges import ChargeCode, ChargeContext, ChargeSchedule, compute_charges
from app.paper.models import Intent, Product, Side
from app.patterns.models import ActivePattern, PatternDirection
from app.patterns.research_filters import detect_candle_ist
from app.user.service import money


@dataclass
class SimTrade:
    id: UUID
    instance_id: str
    symbol_id: str
    trading_symbol: str | None
    timeframe: str
    pattern_type: str
    direction: str
    detect_time: int
    entry: float
    stop: float
    target: float
    qty: int
    flag_confirmed: bool
    flag_retested: bool
    volume_ok: bool
    flag_entry_reached: bool = False
    pending: bool = True
    entry_time: int | None = None
    exit_time: int | None = None
    fill_entry: float | None = None
    fill_exit: float | None = None
    outcome: str | None = None
    r_multiple: float | None = None
    pnl: float | None = None
    charges_entry: float | None = None
    charges_exit: float | None = None
    charges_total: float | None = None
    pnl_net: float | None = None
    r_multiple_net: float | None = None
    mfe_r: float | None = None
    mae_r: float | None = None
    extras: dict = field(default_factory=dict)

    def is_open(self) -> bool:
        return self.outcome is None


def from_pattern(
    pattern: ActivePattern, *, qty: int, trading_symbol: str | None
) -> SimTrade | None:
    if pattern.pattern_type.value == "consolidation":
        return None
    entry = float(pattern.entry_price)
    stop = float(pattern.stop_level)
    target = float(pattern.target_level)
    if not (entry > 0 and stop > 0 and target > 0):
        return None
    if abs(entry - stop) <= 0:
        return None
    return SimTrade(
        id=uuid4(),
        instance_id=str(pattern.id),
        symbol_id=pattern.symbol_id,
        trading_symbol=trading_symbol,
        timeframe=pattern.timeframe,
        pattern_type=pattern.pattern_type.value,
        direction=pattern.direction.value,
        detect_time=int(pattern.detect_candle_time),
        entry=entry,
        stop=stop,
        target=target,
        qty=max(1, int(qty)),
        flag_confirmed=bool(pattern.flag_confirmed),
        flag_retested=bool(pattern.flag_retested),
        flag_entry_reached=False,
        volume_ok=bool(pattern.volume_ok_at_detect),
    )


def _hit_stop_target(trade: SimTrade, candle: Candle, *, stop_wins: bool) -> str | None:
    long = trade.direction == PatternDirection.LONG.value
    if long:
        hit_stop = candle.low <= trade.stop
        hit_target = candle.high >= trade.target
    else:
        hit_stop = candle.high >= trade.stop
        hit_target = candle.low <= trade.target
    if hit_stop and hit_target:
        return "stop" if stop_wins else "target"
    if hit_stop:
        return "stop"
    if hit_target:
        return "target"
    return None


def _close_trade(trade: SimTrade, candle: Candle, outcome: str, price: float) -> None:
    trade.outcome = outcome
    trade.exit_time = int(candle.time)
    trade.fill_exit = float(price)
    trade.pending = False
    entry = float(trade.fill_entry if trade.fill_entry is not None else trade.entry)
    risk = abs(trade.entry - trade.stop)
    signed = (price - entry) if trade.direction == "long" else (entry - price)
    trade.pnl = signed * trade.qty
    trade.r_multiple = (signed / risk) if risk > 0 else None


def notional(trade: SimTrade) -> float | None:
    px = trade.fill_entry if trade.fill_entry is not None else trade.entry
    try:
        price = float(px)
        qty = max(1, int(trade.qty))
    except (TypeError, ValueError):
        return None
    if not (price > 0):
        return None
    return abs(price) * qty


def pnl_pct(trade: SimTrade) -> float | None:
    n = notional(trade)
    if n is None or trade.pnl is None:
        return None
    return float(trade.pnl) / n


def pnl_pct_net(trade: SimTrade) -> float | None:
    n = notional(trade)
    if n is None or trade.pnl_net is None:
        return None
    return float(trade.pnl_net) / n


def _sim_charge_ctx(
    *,
    side: Side,
    product: Product,
    intent: Intent,
    qty: int,
    price: Decimal,
    dp_already_charged_today: bool,
) -> ChargeContext:
    px = Decimal(str(price))
    return ChargeContext(
        side=side,
        product=product,
        intent=intent,
        qty=qty,
        price=px,
        notional=money(Decimal(qty) * px),
        dp_already_charged_today=dp_already_charged_today,
    )


def stamp_sim_charges(
    trades: list[SimTrade],
    product: Product,
    schedule: ChargeSchedule,
) -> None:
    """Set charges_* and pnl_net. Leaves trade.pnl / r_multiple GROSS."""
    dp_charged: set[tuple[str, object]] = set()
    ordered = sorted(trades, key=lambda t: (int(t.exit_time or 0), str(t.id)))
    for trade in ordered:
        if trade.outcome is None or trade.outcome == "no_fill":
            continue
        if trade.pnl is None or trade.fill_entry is None or trade.fill_exit is None:
            continue
        qty = max(1, int(trade.qty))
        long = trade.direction == PatternDirection.LONG.value
        if long:
            entry_side, entry_intent = Side.BUY, Intent.OPEN_LONG
            exit_side, exit_intent = Side.SELL, Intent.CLOSE_LONG
        else:
            entry_side, entry_intent = Side.SELL, Intent.OPEN_SHORT
            exit_side, exit_intent = Side.BUY, Intent.COVER_SHORT

        entry_bd = compute_charges(
            _sim_charge_ctx(
                side=entry_side,
                product=product,
                intent=entry_intent,
                qty=qty,
                price=Decimal(str(trade.fill_entry)),
                dp_already_charged_today=False,
            ),
            schedule,
            enabled=True,
        )
        ist_date = None
        if trade.exit_time is not None:
            dt = detect_candle_ist(trade.exit_time)
            if dt is not None:
                ist_date = dt.date()
        dp_already = bool(
            exit_intent == Intent.CLOSE_LONG
            and product == Product.CNC
            and ist_date is not None
            and (trade.symbol_id, ist_date) in dp_charged
        )
        exit_bd = compute_charges(
            _sim_charge_ctx(
                side=exit_side,
                product=product,
                intent=exit_intent,
                qty=qty,
                price=Decimal(str(trade.fill_exit)),
                dp_already_charged_today=dp_already,
            ),
            schedule,
            enabled=True,
        )
        if (
            exit_intent == Intent.CLOSE_LONG
            and product == Product.CNC
            and ist_date is not None
            and any(ln.code == ChargeCode.DP and ln.amount > 0 for ln in exit_bd.lines)
        ):
            dp_charged.add((trade.symbol_id, ist_date))

        trade.charges_entry = float(entry_bd.total)
        trade.charges_exit = float(exit_bd.total)
        trade.charges_total = float(money(entry_bd.total + exit_bd.total))
        trade.pnl_net = float(
            money(Decimal(str(trade.pnl)) - entry_bd.total - exit_bd.total)
        )
        risk = abs(trade.entry - trade.stop)
        trade.r_multiple_net = (trade.pnl_net / qty) / risk if risk > 0 else None


def square_off_time(product: str, close_minutes: int, mis_hhmm: str) -> time | None:
    if (product or "MIS").upper() != "MIS":
        return None
    parts = (mis_hhmm or "15:20").split(":")
    try:
        hh, mm = int(parts[0]), int(parts[1])
    except (ValueError, IndexError):
        hh, mm = 15, 20
    # Never square off after the cash/CAS close for this symbol.
    close_h, close_m = divmod(int(close_minutes), 60)
    parsed = time(hh, mm)
    cap = time(close_h, close_m)
    return parsed if parsed <= cap else cap


def bar_ist_time(candle: Candle) -> time | None:
    dt = detect_candle_ist(candle.time)
    return None if dt is None else dt.time()


def on_bar(
    trades: list[SimTrade],
    candle: Candle,
    *,
    stop_wins: bool,
    product: str,
    close_minutes: int,
    mis_hhmm: str,
) -> None:
    """Fill pending entries at this open, then check stop/target / MIS square-off."""
    sq = square_off_time(product, close_minutes, mis_hhmm)
    bar_t = bar_ist_time(candle)
    for trade in trades:
        if not trade.is_open():
            continue
        if trade.pending:
            trade.pending = False
            trade.entry_time = int(candle.time)
            trade.fill_entry = float(candle.open)
        hit = _hit_stop_target(trade, candle, stop_wins=stop_wins)
        if hit == "stop":
            _close_trade(trade, candle, "stop", trade.stop)
            continue
        if hit == "target":
            _close_trade(trade, candle, "target", trade.target)
            continue
        if sq is not None and bar_t is not None and bar_t >= sq:
            _close_trade(trade, candle, "mis_squareoff", float(candle.close))


def expire_open(trades: list[SimTrade], candle: Candle | None) -> None:
    if candle is None:
        return
    for trade in trades:
        if trade.is_open() and not trade.pending:
            _close_trade(trade, candle, "expired", float(candle.close))
        elif trade.is_open() and trade.pending:
            trade.outcome = "no_fill"
            trade.pending = False


def sync_flags(trades: list[SimTrade], patterns, bar: Candle | None = None) -> None:
    """Copy lifecycle flags onto existing trades. Does not move rails or fills.

    ``flag_entry_reached`` is the pattern reclaim flag (close through detect
    entry after a retest). Fill timing is unchanged (next open after detect).
    """
    by_id = {str(p.id): p for p in patterns}
    for trade in trades:
        p = by_id.get(trade.instance_id)
        if p is None:
            continue
        trade.flag_confirmed = bool(p.flag_confirmed)
        trade.flag_retested = bool(p.flag_retested)
        trade.volume_ok = bool(p.volume_ok_at_detect)
        trade.flag_entry_reached = bool(getattr(p, "flag_reclaimed", False))


def passes_setup_filters(pattern: ActivePattern, spec) -> bool:
    from app.patterns.planned_rails import passes_max_risk_r, passes_min_risk_r

    if spec.direction and pattern.direction.value != spec.direction:
        return False
    if spec.require_volume and not pattern.volume_ok_at_detect:
        return False
    if spec.min_risk_r is not None and spec.min_risk_r > 0:
        if not passes_min_risk_r(pattern, spec.min_risk_r):
            return False
    if spec.max_risk_r is not None and spec.max_risk_r > 0:
        if not passes_max_risk_r(pattern, spec.max_risk_r):
            return False
    return True


def to_row(trade: SimTrade) -> dict:
    return {
        "id": str(trade.id),
        "instanceId": trade.instance_id,
        "symbolId": trade.symbol_id,
        "tradingSymbol": trade.trading_symbol,
        "timeframe": trade.timeframe,
        "patternType": trade.pattern_type,
        "direction": trade.direction,
        "detectTime": trade.detect_time,
        "entryTime": trade.entry_time,
        "exitTime": trade.exit_time,
        "entry": trade.entry,
        "stop": trade.stop,
        "target": trade.target,
        "fillEntry": trade.fill_entry,
        "fillExit": trade.fill_exit,
        "outcome": trade.outcome,
        "rMultiple": trade.r_multiple,
        "rMultipleNet": trade.r_multiple_net,
        "pnl": trade.pnl,
        "pnlNet": trade.pnl_net,
        "pnlPct": pnl_pct(trade),
        "pnlPctNet": pnl_pct_net(trade),
        "chargesEntry": trade.charges_entry,
        "chargesExit": trade.charges_exit,
        "chargesTotal": trade.charges_total,
        "qty": trade.qty,
        "flagConfirmed": trade.flag_confirmed,
        "flagRetested": trade.flag_retested,
        "flagEntryReached": trade.flag_entry_reached,
        "volumeOk": trade.volume_ok,
        "mfeR": trade.mfe_r,
        "maeR": trade.mae_r,
    }

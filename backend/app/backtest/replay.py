"""Walk closed candles through the same evaluate_*_bar functions live uses."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.backtest.fills import (
    SimTrade,
    expire_open,
    from_pattern,
    notional,
    on_bar,
    passes_setup_filters,
    stamp_sim_charges,
    sync_flags,
    to_row,
)
from app.backtest.spec import PatternSpec, overlay_settings
from app.config import Settings
from app.paper.charges import ChargeSchedule, load_charge_schedule
from app.paper.models import Product
from app.market.ingest import session_end_epoch, session_start_epoch
from app.market.models import Candle
from app.patterns.active_store import ActiveInstanceStore
from app.patterns.bar_eval import evaluate_families_on_bar
from app.patterns.journal import InMemoryPatternJournal
from app.patterns.models import ActivePattern, FinalOutcome
from app.patterns.research_filters import detect_candle_ist


@dataclass
class BacktestResult:
    summary: dict
    trades: list[dict] = field(default_factory=list)
    setups: list[dict] = field(default_factory=list)


def bar_in_session(bar_time: int, spec: PatternSpec) -> bool:
    start = spec.session_start_time()
    end = spec.session_end_time()
    if start is None and end is None:
        return True
    dt = detect_candle_ist(bar_time)
    if dt is None:
        return False
    t = dt.time()
    if start is not None and t < start:
        return False
    if end is not None and t > end:
        return False
    return True


def _is_index(symbol_id: str) -> bool:
    return bool(symbol_id and symbol_id.startswith("NSE_INDEX"))


def _warmup_bars(settings: Settings, spec: PatternSpec) -> int:
    from app.patterns.bar_eval import FAMILY_TYPE_IDS

    n = int(getattr(settings, "atr_period", 14) or 14) + 2
    enabled = spec.enabled_types()
    for attr, types in FAMILY_TYPE_IDS.items():
        if enabled.isdisjoint(types):
            continue
        cfg = getattr(settings, attr, None) or {}
        n = max(
            n,
            int(cfg.get("lookback_candles") or 0),
            int(cfg.get("trend_lookback") or 0),
        )
    return max(n, 20)


def _persist(journal: InMemoryPatternJournal, advanced, newly, events) -> None:
    by_id: dict = {}
    for p in advanced + newly:
        by_id[p.id] = p
    from collections import defaultdict

    grouped: dict = defaultdict(list)
    for e in events:
        grouped[e.pattern_id].append(e)
    for pid, pevts in grouped.items():
        pattern = by_id.get(pid)
        if pattern is None:
            continue
        journal.persist_lifecycle(pattern, pevts)
    for p in advanced + newly:
        if p.id not in grouped:
            journal.apply_events(p, [])


def replay_series(
    *,
    settings: Settings,
    spec: PatternSpec,
    symbol_id: str,
    timeframe: str,
    candles: list[Candle],
    close_minutes: int,
    mis_hhmm: str,
    schedule: ChargeSchedule | None = None,
) -> tuple[list[ActivePattern], list[SimTrade]]:
    if not candles:
        return [], []
    over = overlay_settings(settings, spec)
    store = ActiveInstanceStore()
    journal = InMemoryPatternJournal()
    trades: list[SimTrade] = []
    enabled = spec.enabled_types()
    want_from = session_start_epoch(spec.from_date)
    want_to = session_end_epoch(spec.to_date)
    label = (spec.trading_symbols or {}).get(symbol_id)
    index = _is_index(symbol_id)
    warmup = _warmup_bars(over, spec)

    for i, bar in enumerate(candles):
        closed = candles[: i + 1]
        if len(closed) < 3:
            continue
        now = datetime.fromtimestamp(int(bar.time), tz=timezone.utc)
        in_range = want_from <= int(bar.time) <= want_to
        in_sess = bar_in_session(int(bar.time), spec)
        allow_new = in_range and in_sess and i >= warmup
        open_all = store.get_open(symbol_id, timeframe)
        advanced, newly, events, still = evaluate_families_on_bar(
            settings=over,
            symbol_id=symbol_id,
            timeframe=timeframe,
            closed=closed,
            open_all=open_all,
            now=now,
            index=index,
            enabled_types=enabled,
            allow_new_detects=allow_new,
            max_risk_r=spec.max_risk_r,
        )
        _persist(journal, advanced, newly, events)
        store.replace_series(symbol_id, timeframe, still)

        if spec.trade_enabled:
            on_bar(
                trades,
                bar,
                stop_wins=spec.stop_wins,
                product=spec.product,
                close_minutes=close_minutes,
                mis_hhmm=mis_hhmm,
            )
            open_count = sum(1 for t in trades if t.is_open() and t.symbol_id == symbol_id)
            known = {t.instance_id for t in trades}
            for p in newly:
                if str(p.id) in known:
                    continue
                if int(p.detect_candle_time or 0) < want_from:
                    continue
                if not passes_setup_filters(p, spec):
                    continue
                if spec.one_position and open_count > 0:
                    continue
                sim = from_pattern(p, qty=spec.qty, trading_symbol=label)
                if sim is None:
                    continue
                trades.append(sim)
                known.add(str(p.id))
                open_count += 1
            sync_flags(trades, advanced + newly + still, bar)

    last = candles[-1] if candles else None
    expire_open(trades, last)
    try:
        product = Product(str(spec.product or "MIS").upper())
    except ValueError:
        product = Product.MIS
    stamp_sim_charges(
        trades,
        product,
        schedule
        if schedule is not None
        else load_charge_schedule(settings, log=False),
    )
    trades = [
        t
        for t in trades
        if (not spec.require_retest or t.flag_retested)
        and (not spec.require_confirmed or t.flag_confirmed)
        and (not spec.require_reclaimed or t.flag_entry_reached)
    ]
    setups = journal.list_all() if hasattr(journal, "list_all") else list(
        getattr(journal, "_instances", {}).values()
    )
    return setups, trades


def summarize(
    spec: PatternSpec, setups: list[ActivePattern], trades: list[SimTrade]
) -> BacktestResult:
    succeeded = sum(
        1
        for p in setups
        if p.is_terminal() and p.final_outcome == FinalOutcome.SUCCEEDED
    )
    failed = sum(
        1 for p in setups if p.is_terminal() and p.final_outcome == FinalOutcome.FAILED
    )
    expired = sum(
        1 for p in setups if p.is_terminal() and p.final_outcome == FinalOutcome.EXPIRED
    )
    resolved = succeeded + failed
    resolved_wr = (succeeded / resolved) if resolved else None
    filled = [t for t in trades if t.outcome and t.outcome != "no_fill" and t.r_multiple is not None]
    wins = [t for t in filled if (t.r_multiple or 0) > 0]
    losses = [t for t in filled if (t.r_multiple or 0) <= 0]
    trade_wr = (len(wins) / len(filled)) if filled else None
    avg_r = (sum(t.r_multiple or 0 for t in filled) / len(filled)) if filled else None
    equity = 0.0
    peak = 0.0
    max_dd = 0.0
    ordered = sorted(
        [t for t in filled if t.exit_time is not None],
        key=lambda t: int(t.exit_time or 0),
    )
    for t in ordered:
        equity += float(t.r_multiple or 0)
        if equity > peak:
            peak = equity
        dd = peak - equity
        if dd > max_dd:
            max_dd = dd
    by_type: dict[str, dict] = {}
    by_symbol: dict[str, dict] = {}

    def _bump(bucket: dict, key: str, win: bool) -> None:
        row = bucket.setdefault(key, {"trades": 0, "wins": 0})
        row["trades"] += 1
        if win:
            row["wins"] += 1

    for t in filled:
        win = (t.r_multiple or 0) > 0
        _bump(by_type, t.pattern_type, win)
        _bump(by_symbol, t.trading_symbol or t.symbol_id, win)
    for row in list(by_type.values()) + list(by_symbol.values()):
        n = row["trades"]
        row["wr"] = (row["wins"] / n) if n else None

    total_pnl = sum(float(t.pnl or 0) for t in filled)
    deployed = sum(n for t in filled if (n := notional(t)))
    netted = [t for t in filled if t.pnl_net is not None]
    wins_net = [t for t in netted if (t.r_multiple_net or 0) > 0]
    losses_net = [t for t in netted if (t.r_multiple_net or 0) <= 0]
    trade_wr_net = (len(wins_net) / len(netted)) if netted else None
    avg_r_net = (
        (sum(t.r_multiple_net or 0 for t in netted) / len(netted)) if netted else None
    )
    equity_net = 0.0
    peak_net = 0.0
    max_dd_net = 0.0
    ordered_net = sorted(
        [t for t in netted if t.exit_time is not None],
        key=lambda t: int(t.exit_time or 0),
    )
    for t in ordered_net:
        equity_net += float(t.r_multiple_net or 0)
        if equity_net > peak_net:
            peak_net = equity_net
        dd_net = peak_net - equity_net
        if dd_net > max_dd_net:
            max_dd_net = dd_net
    total_pnl_net = sum(float(t.pnl_net or 0) for t in netted)
    deployed_net = sum(n for t in netted if (n := notional(t)))
    summary = {
        "setups": len(setups),
        "succeeded": succeeded,
        "failed": failed,
        "expired": expired,
        "resolved": resolved,
        "resolvedWr": resolved_wr,
        "trades": len(filled),
        "tradeWins": len(wins),
        "tradeLosses": len(losses),
        "tradeWr": trade_wr,
        "avgR": avg_r,
        "expectancyR": avg_r,
        "maxDdR": max_dd if filled else None,
        "pnl": total_pnl,
        "pnlPct": (total_pnl / deployed) if deployed else None,
        "pnlNet": total_pnl_net,
        "pnlPctNet": (total_pnl_net / deployed_net) if deployed_net else None,
        "avgRNet": avg_r_net,
        "expectancyRNet": avg_r_net,
        "tradeWrNet": trade_wr_net,
        "maxDdRNet": max_dd_net if netted else None,
        "tradeWinsNet": len(wins_net),
        "tradeLossesNet": len(losses_net),
        "byType": by_type,
        "bySymbol": by_symbol,
        "spec": spec.to_dict(),
    }
    setup_rows = []
    for p in setups:
        if not p.is_terminal():
            continue
        setup_rows.append(
            {
                "id": str(p.id),
                "symbolId": p.symbol_id,
                "timeframe": p.timeframe,
                "patternType": p.pattern_type.value,
                "direction": p.direction.value,
                "detectTime": p.detect_candle_time,
                "outcome": p.final_outcome.value if p.final_outcome else None,
                "entry": p.entry_price,
                "stop": p.stop_level,
                "target": p.target_level,
                "flagRetested": p.flag_retested,
                "flagReclaimed": p.flag_reclaimed,
                "volumeOk": p.volume_ok_at_detect,
            }
        )
    return BacktestResult(
        summary=summary,
        trades=[to_row(t) for t in trades if t.outcome],
        setups=setup_rows,
    )

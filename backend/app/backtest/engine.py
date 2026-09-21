"""Orchestrate ingest → replay for one PatternSpec. Safe to run off the live desk."""

from __future__ import annotations

import logging

from app.backtest.jobs import BacktestJobStore
from app.backtest.replay import BacktestResult, replay_series, summarize
from app.backtest.spec import PatternSpec
from app.config import Settings
from app.paper.charges import load_charge_schedule
from app.market.ingest import CandleIngestService
from app.market.session_policy import (
    SessionKind,
    cts_close_minutes,
    session_kind_from_cache,
)
from app.market.warehouse import CandleWarehouse

logger = logging.getLogger(__name__)


def close_minutes_for(symbol_id: str, instruments, settings: Settings) -> int:
    kind = session_kind_from_cache(symbol_id, instruments)
    return cts_close_minutes(kind, cas_enabled=bool(settings.cas_session_enabled))


def mis_hhmm_for(symbol_id: str, instruments, settings: Settings) -> str:
    kind = session_kind_from_cache(symbol_id, instruments)
    if kind is not SessionKind.CASH and bool(settings.cas_session_enabled):
        return str(settings.paper_mis_square_off_cas or "15:10")
    return str(settings.paper_mis_square_off or "15:20")


def execute_spec(
    spec: PatternSpec,
    settings: Settings,
    warehouse: CandleWarehouse,
    ingest: CandleIngestService | None,
    instruments=None,
) -> BacktestResult:
    if not getattr(settings, "backtest_enabled", True):
        raise RuntimeError("Backtest is disabled")
    max_sym = int(getattr(settings, "backtest_max_symbols", 20) or 20)
    if len(spec.symbols) > max_sym:
        raise ValueError(f"at most {max_sym} symbols per run")
    span = (spec.to_date - spec.from_date).days
    max_days = int(getattr(settings, "backtest_max_range_days", 730) or 730)
    if span > max_days:
        raise ValueError(f"date range exceeds {max_days} days")

    all_setups = []
    all_trades = []
    schedule = load_charge_schedule(settings, log=False)
    for symbol_id in spec.symbols:
        close_m = close_minutes_for(symbol_id, instruments, settings)
        mis = mis_hhmm_for(symbol_id, instruments, settings)
        for tf in spec.timeframes:
            from datetime import timedelta

            from app.market.ingest import session_end_epoch, session_start_epoch

            warm_from = spec.from_date - timedelta(days=120)
            candles = []
            if ingest is not None:
                candles = ingest.ensure_range(
                    symbol_id,
                    tf,
                    warm_from,
                    spec.to_date,
                    close_minutes=close_m,
                )
            else:
                candles = warehouse.load(
                    symbol_id,
                    tf,
                    session_start_epoch(warm_from),
                    session_end_epoch(spec.to_date),
                )
            setups, trades = replay_series(
                settings=settings,
                spec=spec,
                symbol_id=symbol_id,
                timeframe=tf,
                candles=candles,
                close_minutes=close_m,
                mis_hhmm=mis,
                schedule=schedule,
            )
            all_setups.extend(setups)
            all_trades.extend(trades)
    return summarize(spec, all_setups, all_trades)


def execute_run(
    run_id,
    jobs: BacktestJobStore,
    settings: Settings,
    warehouse: CandleWarehouse,
    ingest: CandleIngestService | None,
    instruments=None,
) -> dict:
    row = jobs.get(run_id)
    if row is None:
        raise KeyError(f"unknown run {run_id}")
    spec = PatternSpec.from_dict(row["spec"])
    jobs.mark_running(run_id)
    try:
        result = execute_spec(spec, settings, warehouse, ingest, instruments)
        jobs.mark_done(run_id, result.summary, result.trades)
        out = jobs.get(run_id) or {}
        out["trades"] = result.trades
        return out
    except Exception as e:
        logger.exception("Backtest run %s failed", run_id)
        jobs.mark_failed(run_id, str(e))
        raise

"""Backfill daily Woodie rows and instance stamps over the research window."""

from __future__ import annotations

import logging
from datetime import date, timedelta

from app.market.candle_boundary import candle_ist_date
from app.market.nse_clock import is_trading_day
from app.patterns.research_filters import as_epoch_seconds, detect_candle_ist, lookback_start, today_ist
from app.sr.models import FREEZE_BACKFILL, METHOD_WOODIE_OPEN_V1
from app.sr.stamp import stamp_woodie_sr
from app.sr.woodie import compute_woodie_open_v1

logger = logging.getLogger(__name__)


def _window(settings) -> tuple[date, date]:
    today = today_ist()
    max_days = int(getattr(settings, "research_stats_max_range_days", 180) or 180)
    return lookback_start(today, max_range_days=max_days), today


def run_backfill(container, *, force: bool = False, force_live: bool = False) -> dict:
    """Phase A daily rows + Phase B instance stamps. Does not force-reload cache."""
    settings = container.settings
    engine = container.candle_engine
    sr = container.daily_sr_service
    store = sr._store
    journal = container.pattern_journal
    watchlist = container.watchlist_repo
    start, end = _window(settings)

    symbols = {e.symbol_id for e in watchlist.find_all_active()}
    find_ids = getattr(journal, "distinct_instance_symbol_ids", None)
    if callable(find_ids):
        symbols.update(find_ids() or [])

    days_written = 0
    for sid in sorted(symbols):
        closed = engine.get_closed_candles(sid, "1d")
        current = engine.get_current_candle(sid, "1d")
        bars = list(closed)
        if current is not None:
            bars.append(current)
        bars.sort(key=lambda c: int(c.time))
        for i, bar in enumerate(bars):
            day = candle_ist_date(int(bar.time))
            if day < start or day > end or not is_trading_day(day):
                continue
            prev = None
            for earlier in reversed(bars[:i]):
                if candle_ist_date(int(earlier.time)) < day:
                    prev = earlier
                    break
            if prev is None:
                continue
            today_open = float(bar.open)
            open_ts = int(bar.time)
            lookback_1m = int(settings.lookback_days_for("1m"))
            if (end - day).days < lookback_1m:
                opn, ts = sr._bar_open_at(sid, "1m", day)
                if opn is not None:
                    today_open, open_ts = float(opn), ts
            levels = compute_woodie_open_v1(
                prev.high, prev.low, prev.close, today_open, prev_open=prev.open
            )
            existing = store.get(sid, day, METHOD_WOODIE_OPEN_V1)
            if existing is not None and not force:
                continue
            if existing is not None and force and not force_live:
                # only overwrite backfill-sourced rows
                pass
            inserted = store.insert_if_absent(
                sid,
                day,
                levels,
                prev_candle_time=int(prev.time),
                today_open_candle_time=open_ts,
                freeze_source=FREEZE_BACKFILL,
                force=force,
            )
            if inserted:
                days_written += 1

    stamped, skipped, cross_null = _stamp_instances(
        journal, store, engine, settings, start, end
    )
    logger.info(
        "Woodie SR backfill window=%s..%s days=%s stamped=%s skipped=%s cross_null=%s",
        start,
        end,
        days_written,
        stamped,
        skipped,
        cross_null,
    )
    return {
        "windowFrom": start.isoformat(),
        "windowTo": end.isoformat(),
        "daysWritten": days_written,
        "instancesStamped": stamped,
        "instancesSkipped": skipped,
        "crossNull": cross_null,
    }


def _stamp_instances(journal, store, engine, settings, start: date, end: date):
    load = getattr(journal, "iter_instances_for_sr_backfill", None)
    if not callable(load):
        logger.warning(
            "SR instance stamp skipped: journal has no iter_instances_for_sr_backfill"
        )
        return 0, 0, 0
    stamped = skipped = cross_null = 0
    near = float(getattr(settings, "pattern_sr_near_atr", 0.5) or 0.5)
    try:
        rows = load(start, end)
    except Exception:
        logger.exception("SR instance scan failed")
        return 0, 0, 0
    for p in rows:
        if getattr(p, "sr_method", None):
            skipped += 1
            continue
        det = detect_candle_ist(as_epoch_seconds(p.detect_candle_time))
        if det is None:
            skipped += 1
            continue
        session_date = det.date()
        if session_date < start or session_date > end:
            skipped += 1
            continue
        levels = store.get(p.symbol_id, session_date, METHOD_WOODIE_OPEN_V1)
        if levels is None:
            skipped += 1
            continue
        if not (getattr(p, "atr_at_detect", 0) or 0) > 0:
            skipped += 1
            continue
        signal = _find_signal(engine, p.symbol_id, p.timeframe, int(p.detect_candle_time))
        include_cross = signal is not None
        stamp_woodie_sr(
            p,
            signal,
            levels,
            session_date=session_date,
            near_atr=near,
            include_cross=include_cross,
        )
        if p.sr_method is None:
            skipped += 1
            continue
        if not include_cross:
            cross_null += 1
        if hasattr(journal, "update_sr_stamp"):
            journal.update_sr_stamp(p)
        stamped += 1
    return stamped, skipped, cross_null


def _find_signal(engine, symbol_id: str, timeframe: str, detect_time: int):
    want = as_epoch_seconds(detect_time)
    for bar in engine.get_closed_candles(symbol_id, timeframe):
        if as_epoch_seconds(bar.time) == want:
            return bar
    current = engine.get_current_candle(symbol_id, timeframe)
    if current is not None and as_epoch_seconds(current.time) == want:
        return current
    return None

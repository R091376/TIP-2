from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone

from app.patterns.active_store import ActiveInstanceStore
from app.patterns.lifecycle_support import expire

logger = logging.getLogger(__name__)


def reconcile_patterns_on_startup(
    settings,
    journal,
    active_store: ActiveInstanceStore,
    watchlist_repo,
    event_bus=None,
) -> None:
    """
    PI-15 parity:
    - expire open session-close TFs (1m/5m/15m) with startup_recovery
    - hydrate multi-day opens (1h/4h/1d) into ActiveInstanceStore
    """
    if not settings.pattern_enabled or not journal.is_active():
        logger.info("Pattern startup reconcile skipped (patterns off or journal inactive)")
        return

    now = datetime.now(timezone.utc)
    session_tfs = set(settings.expiry_session_close_timeframes or [])
    multi_day = {"1h", "4h", "1d"}

    # Prefer find_open_by_timeframes when available
    find_by_tfs = getattr(journal, "find_open_by_timeframes", None)

    session_opens = []
    if find_by_tfs and session_tfs:
        session_opens = find_by_tfs(session_tfs)
    for p in session_opens:
        events = expire(p, None, "startup_recovery", now, True)
        journal.apply_events(p, events)

    logger.info(
        "Pattern startup: expired %s session-close open instance(s)", len(session_opens)
    )

    multi = find_by_tfs(multi_day) if find_by_tfs else []
    by_series: dict[tuple[str, str], list] = defaultdict(list)
    hydrated = 0
    dropped = 0
    for p in multi:
        on_list = watchlist_repo.contains_symbol_id(p.symbol_id) or (
            watchlist_repo.find_by_symbol_id(p.symbol_id) is not None
        )
        if not on_list:
            events = expire(p, None, "startup_recovery", now, True)
            journal.apply_events(p, events)
            dropped += 1
            continue
        by_series[(p.symbol_id, p.timeframe)].append(p)
        hydrated += 1

    for (sid, tf), patterns in by_series.items():
        active_store.replace_series(sid, tf, patterns)

    logger.info(
        "Pattern startup: hydrated %s multi-day open instance(s), dropped %s off-watchlist",
        hydrated,
        dropped,
    )

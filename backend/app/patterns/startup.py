from __future__ import annotations

import logging
from collections import defaultdict

from app.patterns.active_store import ActiveInstanceStore

logger = logging.getLogger(__name__)

# Restart recovery must not leave expired noise in the day feed / journal.
# max_candles / session_close expiries are kept; only startup_recovery is purged.
STARTUP_RECOVERY_REASON = "startup_recovery"


def _purge_instance(journal, pattern_id) -> bool:
    purge = getattr(journal, "purge_instance", None)
    if callable(purge):
        return bool(purge(pattern_id))
    return False


def reconcile_patterns_on_startup(
    settings,
    journal,
    active_store: ActiveInstanceStore,
    watchlist_repo,
    event_bus=None,
) -> None:
    """
    PI-15 style startup:

    - Open session-close TFs (1m/5m/15m): **purge** instance + all events
      (restart noise — do not write stage=expired).
    - Multi-day opens on watchlist: hydrate into ActiveInstanceStore.
    - Multi-day opens off watchlist: purge (same as restart cleanup).
    - Historical outcomes with reason=startup_recovery: purge cascade.
    - max_candles / session_close expired patterns are left intact.
    """
    if not settings.pattern_enabled or not journal.is_active():
        logger.info("Pattern startup reconcile skipped (patterns off or journal inactive)")
        return

    session_tfs = set(settings.expiry_session_close_timeframes or [])
    multi_day = {"1h", "4h", "1d"}

    find_by_tfs = getattr(journal, "find_open_by_timeframes", None)

    purged_session = 0
    session_opens = []
    if find_by_tfs and session_tfs:
        session_opens = find_by_tfs(session_tfs)
    for p in session_opens:
        if _purge_instance(journal, p.id):
            purged_session += 1

    logger.info(
        "Pattern startup: purged %s open session-close instance(s) (restart cleanup)",
        purged_session,
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
            if _purge_instance(journal, p.id):
                dropped += 1
            continue
        by_series[(p.symbol_id, p.timeframe)].append(p)
        hydrated += 1

    for (sid, tf), patterns in by_series.items():
        active_store.replace_series(sid, tf, patterns)

    # Clean prior restart-expiry rows still in the journal (and their events).
    purged_hist = 0
    purge_hist = getattr(journal, "purge_by_outcome_reason", None)
    if callable(purge_hist):
        purged_hist = int(purge_hist(STARTUP_RECOVERY_REASON) or 0)

    logger.info(
        "Pattern startup: hydrated %s multi-day open instance(s), "
        "purged %s off-watchlist, purged %s historical startup_recovery",
        hydrated,
        dropped,
        purged_hist,
    )

import { useMemo, useState } from 'react'
import InstrumentSearch from './InstrumentSearch'
import WatchlistBar from './WatchlistBar'

/**
 * Right-side watchlist panel: search + vertical list with per-row remove.
 */
export default function SymbolSwitcher({
  watchlist,
  activeSymbolId,
  onSelect,
  onAdd,
  onRemove,
  disabled,
  adding,
  hardMax = 50,
  /** Only admins may add/remove shared watchlist symbols. */
  canManage = false,
}) {
  const [removingId, setRemovingId] = useState(null)

  const watchlistKeys = useMemo(
    () => new Set((watchlist || []).map((e) => e.symbolId)),
    [watchlist],
  )

  async function handleRemove(symbolId) {
    if (!canManage || !symbolId || disabled || adding) return
    setRemovingId(symbolId)
    try {
      await onRemove(symbolId)
    } finally {
      setRemovingId(null)
    }
  }

  const count = watchlist?.length ?? 0

  return (
    <aside className="watchlist-sidebar" aria-label="Watchlist sidebar">
      <div className="watchlist-sidebar__header">
        <h2 className="watchlist-sidebar__title">Watchlist</h2>
        <span className="watchlist-sidebar__count">
          {count}/{hardMax}
        </span>
      </div>

      {canManage ? (
        <div className="watchlist-sidebar__search">
          <InstrumentSearch
            onAdd={onAdd}
            watchlistKeys={watchlistKeys}
            hardMax={hardMax}
            watchlistSize={count}
            disabled={disabled}
            adding={adding}
            compact
          />
        </div>
      ) : (
        <p className="watchlist-sidebar__readonly-hint">
          Shared list — only admins can add or remove symbols.
        </p>
      )}

      {/* Add/remove is admin-only; every user can still switch the active chart symbol. */}
      <div className="watchlist-sidebar__list">
        <WatchlistBar
          watchlist={watchlist}
          activeSymbolId={activeSymbolId}
          onSelect={onSelect}
          onRemove={canManage ? handleRemove : undefined}
          disabled={disabled || adding}
          removingId={removingId}
        />
      </div>
    </aside>
  )
}

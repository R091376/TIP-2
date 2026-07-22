function statusClass(status) {
  const s = (status || '').toString().toUpperCase()
  if (s === 'READY') return 'badge-ready'
  if (s === 'PENDING') return 'badge-pending'
  if (s === 'FAILED') return 'badge-failed'
  return 'badge-unknown'
}

function rowLabel(entry) {
  return entry.tradingSymbol || entry.displayName || entry.symbolId
}

/**
 * Vertical watchlist: click row selects chart; × removes that symbol.
 */
export default function WatchlistBar({
  watchlist,
  activeSymbolId,
  onSelect,
  onRemove,
  disabled,
  removingId,
}) {
  if (!watchlist?.length) {
    return (
      <div className="watchlist-list watchlist-list--empty" aria-label="Watchlist empty">
        <span className="watchlist-list__empty-hint">
          No symbols yet. Use search above to add a stock or index.
        </span>
      </div>
    )
  }

  return (
    <ul className="watchlist-list" role="list" aria-label="Watchlist">
      {watchlist.map((entry) => {
        const isActive = entry.symbolId === activeSymbolId
        const status = (entry.bootstrapStatus || '').toString().toUpperCase()
        const showBadge = status && status !== 'READY'
        const busy = removingId === entry.symbolId
        const subtitle =
          entry.displayName &&
          entry.displayName !== entry.tradingSymbol
            ? entry.displayName
            : entry.segment || entry.instrumentType || ''

        return (
          <li
            key={entry.symbolId}
            className={
              'watchlist-row' +
              (isActive ? ' watchlist-row--active' : '') +
              (status === 'FAILED' ? ' watchlist-row--failed' : '') +
              (status === 'PENDING' ? ' watchlist-row--pending' : '')
            }
          >
            <button
              type="button"
              className="watchlist-row__select"
              disabled={disabled}
              onClick={() => onSelect(entry.symbolId)}
              title={
                entry.bootstrapError
                  ? entry.bootstrapError
                  : entry.displayName || entry.tradingSymbol
              }
            >
              <span className="watchlist-row__text">
                <span className="watchlist-row__symbol">{rowLabel(entry)}</span>
                {subtitle ? (
                  <span className="watchlist-row__name">{subtitle}</span>
                ) : null}
              </span>
              {showBadge && (
                <span className={`watchlist-row__badge ${statusClass(status)}`}>
                  {status}
                </span>
              )}
            </button>
            {typeof onRemove === 'function' && (
              <button
                type="button"
                className="watchlist-row__remove"
                disabled={disabled || busy}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(entry.symbolId)
                }}
                aria-label={`Remove ${rowLabel(entry)} from watchlist`}
                title={`Remove ${rowLabel(entry)}`}
              >
                {busy ? '…' : '×'}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

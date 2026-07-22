/**
 * Live pattern alerts (session-only). Newest first.
 * Click an alert → parent navigates chart + draws overlay.
 * Client-side filters: symbol, timeframe, pattern type.
 */

import { useMemo, useState } from 'react'
import { ALERTS_MAX } from '../utils/alertList'

const MAX_VISIBLE = ALERTS_MAX
const ALL = ''

const STAGE_TONE = {
  detected: 'info',
  confirmed: 'info',
  retested: 'warn',
  strengthened: 'warn',
  succeeded: 'success',
  failed: 'danger',
  expired: 'muted',
}

function stageTone(stage) {
  return STAGE_TONE[(stage || '').toLowerCase()] || 'muted'
}

function formatAlertTime(unixSec) {
  if (!unixSec) return '—'
  try {
    return new Date(unixSec * 1000).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    })
  } catch {
    return '—'
  }
}

function formatPrice(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  return v >= 100 ? v.toFixed(2) : v.toFixed(v >= 10 ? 2 : 4)
}

function shortSymbol(symbolId, displayName) {
  if (displayName) return displayName
  if (!symbolId) return '?'
  const pipe = symbolId.indexOf('|')
  return pipe >= 0 ? symbolId.slice(pipe + 1) : symbolId
}

function formatPatternLabel(patternType) {
  if (!patternType) return 'Pattern'
  return String(patternType).replace(/_/g, ' ')
}

function sortTf(a, b) {
  const order = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440 }
  const da = order[a] ?? 9999
  const db = order[b] ?? 9999
  if (da !== db) return da - db
  return String(a).localeCompare(String(b))
}

export default function AlertsFeed({
  alerts,
  selectedId,
  selectedInstanceId,
  onSelect,
  onClear,
  symbolLabels = {},
}) {
  const [filterSymbol, setFilterSymbol] = useState(ALL)
  const [filterTimeframe, setFilterTimeframe] = useState(ALL)
  const [filterPattern, setFilterPattern] = useState(ALL)

  const symbolOptions = useMemo(() => {
    const map = new Map()
    for (const a of alerts || []) {
      if (!a?.symbolId || map.has(a.symbolId)) continue
      map.set(
        a.symbolId,
        shortSymbol(a.symbolId, symbolLabels[a.symbolId] || a.displayName),
      )
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((x, y) => x.label.localeCompare(y.label))
  }, [alerts, symbolLabels])

  const timeframeOptions = useMemo(() => {
    const set = new Set()
    for (const a of alerts || []) {
      if (a?.timeframe) set.add(a.timeframe)
    }
    return [...set].sort(sortTf)
  }, [alerts])

  const patternOptions = useMemo(() => {
    const set = new Set()
    for (const a of alerts || []) {
      if (a?.patternType) set.add(a.patternType)
    }
    return [...set].sort((a, b) =>
      formatPatternLabel(a).localeCompare(formatPatternLabel(b)),
    )
  }, [alerts])

  const filtersActive =
    filterSymbol !== ALL || filterTimeframe !== ALL || filterPattern !== ALL

  const filtered = useMemo(() => {
    const list = alerts || []
    return list.filter((a) => {
      if (filterSymbol && a.symbolId !== filterSymbol) return false
      if (filterTimeframe && a.timeframe !== filterTimeframe) return false
      if (filterPattern && a.patternType !== filterPattern) return false
      return true
    })
  }, [alerts, filterSymbol, filterTimeframe, filterPattern])

  const items = filtered.slice(0, MAX_VISIBLE)
  const total = alerts?.length ?? 0

  function resetFilters() {
    setFilterSymbol(ALL)
    setFilterTimeframe(ALL)
    setFilterPattern(ALL)
  }

  return (
    <section className="alerts-feed" aria-label="Pattern alerts">
      <div className="alerts-feed__header">
        <h2 className="alerts-feed__title">Alerts</h2>
        <div className="alerts-feed__header-actions">
          <span
            className="alerts-feed__count"
            title={
              filtersActive
                ? `${items.length} shown of ${total} session alerts`
                : `${items.length} session alerts`
            }
          >
            {filtersActive ? `${items.length}/${total}` : items.length}
          </span>
          {total > 0 && (
            <button
              type="button"
              className="alerts-feed__clear"
              onClick={onClear}
              title="Clear session alerts"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {total > 0 && (
        <div className="alerts-feed__filters" aria-label="Filter alerts">
          <label className="alerts-feed__filter">
            <span className="alerts-feed__filter-label">Symbol</span>
            <select
              className="alerts-feed__select"
              value={filterSymbol}
              onChange={(e) => setFilterSymbol(e.target.value)}
            >
              <option value={ALL}>All</option>
              {symbolOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="alerts-feed__filter">
            <span className="alerts-feed__filter-label">TF</span>
            <select
              className="alerts-feed__select"
              value={filterTimeframe}
              onChange={(e) => setFilterTimeframe(e.target.value)}
            >
              <option value={ALL}>All</option>
              {timeframeOptions.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </label>

          <label className="alerts-feed__filter">
            <span className="alerts-feed__filter-label">Pattern</span>
            <select
              className="alerts-feed__select"
              value={filterPattern}
              onChange={(e) => setFilterPattern(e.target.value)}
            >
              <option value={ALL}>All</option>
              {patternOptions.map((p) => (
                <option key={p} value={p}>
                  {formatPatternLabel(p)}
                </option>
              ))}
            </select>
          </label>

          {filtersActive && (
            <button
              type="button"
              className="alerts-feed__filter-reset"
              onClick={resetFilters}
              title="Reset filters"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {total === 0 ? (
        <p className="alerts-feed__empty">
          Live pattern events appear here while the app is open. Requires Postgres
          patterns enabled on the backend. Click an alert to show the full instance
          lifecycle (reference line + stage markers).
        </p>
      ) : items.length === 0 ? (
        <p className="alerts-feed__empty">
          No alerts match the current filters.
          <button
            type="button"
            className="alerts-feed__empty-reset"
            onClick={resetFilters}
          >
            Reset filters
          </button>
        </p>
      ) : (
        <ul className="alerts-feed__list">
          {items.map((a) => {
            const tone = stageTone(a.stage)
            const active =
              a.id === selectedId ||
              (selectedInstanceId && a.instanceId === selectedInstanceId)
            const focus = a.id === selectedId
            const label = shortSymbol(
              a.symbolId,
              symbolLabels[a.symbolId] || a.displayName,
            )
            return (
              <li key={a.id}>
                <button
                  type="button"
                  className={`alerts-feed__row${active ? ' alerts-feed__row--active' : ''}${focus ? ' alerts-feed__row--focus' : ''}`}
                  onClick={() => onSelect?.(a)}
                >
                  <div className="alerts-feed__row-top">
                    <span className={`alerts-feed__stage alerts-feed__stage--${tone}`}>
                      {(a.stage || 'event').toUpperCase()}
                    </span>
                    <span className="alerts-feed__tf">{a.timeframe}</span>
                  </div>
                  <div className="alerts-feed__row-main">
                    <span className="alerts-feed__symbol">{label}</span>
                    <span className="alerts-feed__pattern">
                      {formatPatternLabel(a.patternType)}
                      {a.direction ? ` · ${a.direction}` : ''}
                    </span>
                  </div>
                  <div className="alerts-feed__row-meta">
                    <span className="alerts-feed__price">@ {formatPrice(a.price)}</span>
                    <span className="alerts-feed__time">{formatAlertTime(a.time)}</span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export { ALERTS_MAX }

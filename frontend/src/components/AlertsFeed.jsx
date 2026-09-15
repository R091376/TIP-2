/**
 * Pattern alerts for the trading day (loaded from API + live WS).
 * Newest first. Click an alert → parent navigates chart + draws overlay.
 * Client-side filters: symbol, timeframe, pattern type.
 */

import { useMemo, useState } from 'react'
import { ALERTS_MAX, filterVisibleAlerts } from '../utils/alertList'
import { PATTERN_TYPE_IDS, formatPatternTypeLabel } from '../utils/patternCatalog'
import { getDefaultTimeframes } from '../services/marketApi'

const MAX_VISIBLE = ALERTS_MAX
const ALL = ''

/**
 * Fixed slot height for the windowed list (card + inter-row gap).
 * Must match .alerts-feed__row-item height in alerts.css — too short causes
 * adjacent cards to overlap (prices/text appear to mix between alerts).
 */
const ALERT_ROW_H = 96
const ALERT_OVERSCAN = 8

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

  const visibleAlerts = useMemo(
    () => filterVisibleAlerts(alerts || []),
    [alerts],
  )

  const symbolOptions = useMemo(() => {
    const map = new Map()
    for (const [id, label] of Object.entries(symbolLabels || {})) {
      if (id) map.set(id, label || shortSymbol(id))
    }
    for (const a of visibleAlerts) {
      if (!a?.symbolId || map.has(a.symbolId)) continue
      map.set(
        a.symbolId,
        shortSymbol(a.symbolId, symbolLabels[a.symbolId] || a.displayName),
      )
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((x, y) => x.label.localeCompare(y.label))
  }, [visibleAlerts, symbolLabels])

  const timeframeOptions = useMemo(() => {
    const set = new Set(getDefaultTimeframes())
    for (const a of visibleAlerts) {
      if (a?.timeframe) set.add(a.timeframe)
    }
    return [...set].sort(sortTf)
  }, [visibleAlerts])

  const patternOptions = useMemo(() => {
    const set = new Set(PATTERN_TYPE_IDS)
    for (const a of visibleAlerts) {
      if (a?.patternType) set.add(a.patternType)
    }
    return [...set].sort((a, b) =>
      formatPatternTypeLabel(a).localeCompare(formatPatternTypeLabel(b)),
    )
  }, [visibleAlerts])

  const filtersActive =
    filterSymbol !== ALL || filterTimeframe !== ALL || filterPattern !== ALL

  const filtered = useMemo(() => {
    return visibleAlerts.filter((a) => {
      // Keep expired (muted stage pill); only apply user filters.
      if (filterSymbol && a.symbolId !== filterSymbol) return false
      if (filterTimeframe && a.timeframe !== filterTimeframe) return false
      if (filterPattern && a.patternType !== filterPattern) return false
      return true
    })
  }, [visibleAlerts, filterSymbol, filterTimeframe, filterPattern])

  const items = useMemo(
    () => filtered.slice(0, MAX_VISIBLE),
    [filtered],
  )
  const total = visibleAlerts.length
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(480)

  function onListScroll(e) {
    setScrollTop(e.currentTarget.scrollTop)
  }

  function onListRef(el) {
    if (el) setViewportH(el.clientHeight || 480)
  }

  // Window only for longer lists; always use fixed row slots so cards never overlap.
  const windowed = useMemo(() => {
    if (items.length <= 60) {
      return { padTop: 0, padBottom: 0, slice: items }
    }
    const start = Math.max(0, Math.floor(scrollTop / ALERT_ROW_H) - ALERT_OVERSCAN)
    const visibleCount = Math.ceil(viewportH / ALERT_ROW_H) + ALERT_OVERSCAN * 2
    const end = Math.min(items.length, start + visibleCount)
    return {
      padTop: start * ALERT_ROW_H,
      padBottom: Math.max(0, (items.length - end) * ALERT_ROW_H),
      slice: items.slice(start, end),
    }
  }, [items, scrollTop, viewportH])

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
                ? `${items.length} shown of ${total} day's alerts`
                : `${items.length} day's alerts`
            }
          >
            {filtersActive ? `${items.length}/${total}` : items.length}
          </span>
          {total > 0 && (
            <button
              type="button"
              className="alerts-feed__clear"
              onClick={onClear}
              title="Clear the alerts list only (chart drawings are unchanged — use Clear drawings on the chart)"
            >
              Clear alerts
            </button>
          )}
        </div>
      </div>

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
                  {formatPatternTypeLabel(p)}
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

      {total === 0 && !filtersActive ? (
        <p className="alerts-feed__empty">
          Live pattern events appear here while the app is open. Requires Postgres
          patterns enabled on the backend. Click an alert to show the full instance
          lifecycle (rails + stage markers) and an inspect card with ATR / stop / target.
        </p>
      ) : items.length === 0 ? (
        <p className="alerts-feed__empty">
          {total === 0
            ? 'No matching alerts yet — waiting for this filter.'
            : 'No alerts match the current filters.'}
          <button
            type="button"
            className="alerts-feed__empty-reset"
            onClick={resetFilters}
          >
            Reset filters
          </button>
        </p>
      ) : (
        <ul
          ref={onListRef}
          className="alerts-feed__list alerts-feed__list--windowed"
          onScroll={onListScroll}
        >
          {windowed.padTop > 0 ? (
            <li
              className="alerts-feed__spacer"
              style={{ height: windowed.padTop }}
              aria-hidden
            />
          ) : null}
          {windowed.slice.map((a) => {
            const tone = stageTone(a.stage)
            const active =
              a.id === selectedId ||
              (selectedInstanceId && a.instanceId === selectedInstanceId)
            const focus = a.id === selectedId
            const label = shortSymbol(
              a.symbolId,
              symbolLabels[a.symbolId] || a.displayName,
            )
            // Prefer stable unique key; fall back so duplicate/missing ids cannot
            // reuse the wrong DOM node (which looked like mixed prices).
            const rowKey =
              a.id ||
              [
                a.instanceId || 'x',
                a.stage || 'event',
                a.time ?? '',
                a.price ?? '',
                a.symbolId || '',
                a.timeframe || '',
              ].join(':')
            return (
              <li key={rowKey} className="alerts-feed__row-item">
                <button
                  type="button"
                  className={`alerts-feed__row${active ? ' alerts-feed__row--active' : ''}${focus ? ' alerts-feed__row--focus' : ''}`}
                  onClick={() => onSelect?.(a)}
                  title={`Open ${label} on chart · @ ${formatPrice(a.price)}`}
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
                      {formatPatternTypeLabel(a.patternType)}
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
          {windowed.padBottom > 0 ? (
            <li
              className="alerts-feed__spacer"
              style={{ height: windowed.padBottom }}
              aria-hidden
            />
          ) : null}
        </ul>
      )}
    </section>
  )
}

export { ALERTS_MAX }

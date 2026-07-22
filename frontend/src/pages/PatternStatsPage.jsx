import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import UserAccountMenu from '../components/UserAccountMenu'
import { fetchPatternStatistics } from '../services/patternStatisticsApi'
import '../styles/userAccount.css'
import './authPages.css'
import './patternStats.css'

const TIMEFRAMES = ['all', '1m', '5m', '15m', '1h', '4h', '1d']
/** Base options; live types from data are merged in. */
const BASE_PATTERN_TYPES = ['all', 'breakout', 'breakdown']

const SORT_OPTIONS = [
  { value: 'resolvedSuccessRate', label: 'Resolved success %' },
  { value: 'avgMfeR', label: 'Avg MFE (R)' },
  { value: 'avgMaeR', label: 'Avg MAE (R)' },
  { value: 'sampleSize', label: 'Sample size' },
  { value: 'symbol', label: 'Symbol' },
]

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return `${(Number(value) * 100).toFixed(1)}%`
}

function num(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

function rowKey(item) {
  return `${item.symbolId}|${item.patternType}|${item.timeframe}`
}

function symbolLabel(item) {
  return item.tradingSymbol || item.displayName || item.symbolId || '—'
}

function isReady(item, minSampleSize) {
  return item.status === 'ok' && (item.sampleSize ?? 0) >= minSampleSize
}

/**
 * Relative highlight among Ready rows in the current filtered view.
 * Top quartile (min 1) by the active sort metric.
 */
function computeHighlightKeys(rows, sortKey, minSampleSize) {
  const ready = rows.filter((r) => isReady(r, minSampleSize))
  if (ready.length === 0) return new Set()

  const metric = (r) => {
    if (sortKey === 'avgMfeR') return r.avgMfeR
    if (sortKey === 'avgMaeR') return r.avgMaeR
    if (sortKey === 'sampleSize') return r.sampleSize
    if (sortKey === 'symbol') return null
    return r.resolvedSuccessRate
  }

  // MAE: lower is “better” (less adverse pain)
  const ascending = sortKey === 'avgMaeR'
  const scored = ready
    .map((r) => ({ key: rowKey(r), v: metric(r) }))
    .filter((x) => x.v != null && !Number.isNaN(Number(x.v)))

  if (scored.length === 0) return new Set()

  scored.sort((a, b) => (ascending ? a.v - b.v : b.v - a.v))
  const topN = Math.max(1, Math.ceil(scored.length * 0.25))
  return new Set(scored.slice(0, topN).map((x) => x.key))
}

function sortRows(rows, sortKey, minSampleSize) {
  const copy = [...rows]
  copy.sort((a, b) => {
    const aReady = isReady(a, minSampleSize)
    const bReady = isReady(b, minSampleSize)
    // Ready rows first when sorting by rate metrics
    if (sortKey !== 'symbol' && sortKey !== 'sampleSize' && aReady !== bReady) {
      return aReady ? -1 : 1
    }

    const cmpNum = (av, bv, asc = false) => {
      const aNull = av == null || Number.isNaN(Number(av))
      const bNull = bv == null || Number.isNaN(Number(bv))
      if (aNull && bNull) return 0
      if (aNull) return 1
      if (bNull) return -1
      return asc ? Number(av) - Number(bv) : Number(bv) - Number(av)
    }

    let primary = 0
    switch (sortKey) {
      case 'avgMfeR':
        primary = cmpNum(a.avgMfeR, b.avgMfeR)
        break
      case 'avgMaeR':
        primary = cmpNum(a.avgMaeR, b.avgMaeR, true)
        break
      case 'sampleSize':
        primary = cmpNum(a.sampleSize, b.sampleSize)
        break
      case 'symbol':
        primary = symbolLabel(a).localeCompare(symbolLabel(b))
        break
      case 'resolvedSuccessRate':
      default:
        primary = cmpNum(a.resolvedSuccessRate, b.resolvedSuccessRate)
        break
    }
    if (primary !== 0) return primary

    // Secondary: MFE desc, then n desc, then symbol
    const mfe = cmpNum(a.avgMfeR, b.avgMfeR)
    if (mfe !== 0) return mfe
    const n = cmpNum(a.sampleSize, b.sampleSize)
    if (n !== 0) return n
    return symbolLabel(a).localeCompare(symbolLabel(b))
  })
  return copy
}

export default function PatternStatsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [minSampleSize, setMinSampleSize] = useState(20)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const [patternType, setPatternType] = useState('all')
  const [timeframe, setTimeframe] = useState('all')
  const [readyOnly, setReadyOnly] = useState(false)
  const [symbolQuery, setSymbolQuery] = useState('')
  const [sortKey, setSortKey] = useState('resolvedSuccessRate')
  const [expanded, setExpanded] = useState(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {}
      if (patternType !== 'all') params.patternType = patternType
      if (timeframe !== 'all') params.timeframe = timeframe
      const data = await fetchPatternStatistics(params)
      setItems(data.items)
      setMinSampleSize(data.minSampleSize || 20)
    } catch (e) {
      setItems([])
      setError(e instanceof Error ? e.message : 'Failed to load pattern statistics')
    } finally {
      setLoading(false)
    }
  }, [patternType, timeframe])

  useEffect(() => {
    void load()
  }, [load])

  const patternTypeOptions = useMemo(() => {
    const fromData = new Set(
      items.map((i) => i.patternType).filter(Boolean).map((t) => String(t).toLowerCase()),
    )
    const merged = [...BASE_PATTERN_TYPES]
    for (const t of fromData) {
      if (!merged.includes(t)) merged.push(t)
    }
    return merged
  }, [items])

  const filtered = useMemo(() => {
    const q = symbolQuery.trim().toLowerCase()
    let rows = items
    if (readyOnly) {
      rows = rows.filter((r) => isReady(r, minSampleSize))
    }
    if (q) {
      rows = rows.filter((r) => {
        const label = symbolLabel(r).toLowerCase()
        const id = (r.symbolId || '').toLowerCase()
        return label.includes(q) || id.includes(q)
      })
    }
    return sortRows(rows, sortKey, minSampleSize)
  }, [items, readyOnly, symbolQuery, sortKey, minSampleSize])

  const highlightKeys = useMemo(
    () => computeHighlightKeys(filtered, sortKey, minSampleSize),
    [filtered, sortKey, minSampleSize],
  )

  function toggleExpand(key) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openOnChart(item) {
    const params = new URLSearchParams()
    if (item.symbolId) params.set('symbol', item.symbolId)
    if (item.timeframe) params.set('tf', item.timeframe)
    navigate(`/?${params.toString()}`)
  }

  return (
    <div className="admin-page stats-page">
      <header className="admin-header">
        <div>
          <h1 className="admin-header__title">Pattern statistics</h1>
          <p className="admin-header__sub">
            Research ranking across the watchlist · rates unlock at n ≥ {minSampleSize} ·
            not trade advice
          </p>
        </div>
        <div className="admin-header__actions">
          <Link to="/" className="admin-link">
            Chart
          </Link>
          <UserAccountMenu user={user} onLogout={() => logout()} />
        </div>
      </header>

      {error && <div className="admin-banner admin-banner--error">{error}</div>}

      <section className="admin-card stats-filters">
        <div className="admin-form stats-filters__form">
          <label>
            Pattern
            <select value={patternType} onChange={(e) => setPatternType(e.target.value)}>
              {patternTypeOptions.map((p) => (
                <option key={p} value={p}>
                  {p === 'all' ? 'All' : p}
                </option>
              ))}
            </select>
          </label>
          <label>
            Timeframe
            <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf === 'all' ? 'All' : tf}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sort by
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Symbol
            <input
              type="search"
              placeholder="Filter symbol…"
              value={symbolQuery}
              onChange={(e) => setSymbolQuery(e.target.value)}
            />
          </label>
          <label className="stats-check">
            <input
              type="checkbox"
              checked={readyOnly}
              onChange={(e) => setReadyOnly(e.target.checked)}
            />
            Ready only (n ≥ {minSampleSize})
          </label>
          <div className="stats-filters__actions">
            <button
              type="button"
              className="admin-btn admin-btn--small"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
        <p className="stats-legend">
          Highlight = top quartile among <strong>Ready</strong> rows for current sort (relative
          rank in this view). S / F / E = success / fail / expired counts.
        </p>
      </section>

      <section className="admin-card">
        <div className="admin-card__head">
          <h2>Buckets</h2>
          <span className="stats-count">
            {loading ? '…' : `${filtered.length} row${filtered.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {!loading && filtered.length === 0 && (
          <p className="admin-empty">
            No statistics rows yet. Pattern journal needs Postgres + closed outcomes on the
            watchlist. Building history still shows S/F/E counts when any samples exist.
          </p>
        )}

        {filtered.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table stats-table">
              <thead>
                <tr>
                  <th aria-label="Expand" />
                  <th>Symbol</th>
                  <th>Pattern</th>
                  <th>TF</th>
                  <th>S / F / E</th>
                  <th>n</th>
                  <th>Resolved %</th>
                  <th>MFE (R)</th>
                  <th>MAE (R)</th>
                  <th>Status</th>
                  <th aria-label="Open chart" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const key = rowKey(item)
                  const ready = isReady(item, minSampleSize)
                  const open = expanded.has(key)
                  const hi = highlightKeys.has(key)
                  return (
                    <FragmentRow
                      key={key}
                      item={item}
                      ready={ready}
                      open={open}
                      highlight={hi}
                      minSampleSize={minSampleSize}
                      onToggle={() => toggleExpand(key)}
                      onOpenChart={() => openOnChart(item)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function FragmentRow({ item, ready, open, highlight, minSampleSize, onToggle, onOpenChart }) {
  const statusLabel = ready
    ? 'Ready'
    : `Building (${item.sampleSize ?? 0}/${minSampleSize})`

  return (
    <>
      <tr
        className={[
          'stats-row',
          highlight ? 'stats-row--highlight' : '',
          open ? 'stats-row--open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <td>
          <button
            type="button"
            className="stats-expand"
            aria-expanded={open}
            aria-label={open ? 'Collapse details' : 'Expand details'}
            onClick={onToggle}
          >
            {open ? '▾' : '▸'}
          </button>
        </td>
        <td>
          <div className="admin-user-cell">
            <strong>{symbolLabel(item)}</strong>
            <span title={item.symbolId}>{item.symbolId}</span>
          </div>
        </td>
        <td>{item.patternType}</td>
        <td className="admin-mono">{item.timeframe}</td>
        <td className="admin-mono">
          {item.successCount ?? 0} / {item.failCount ?? 0} / {item.expiredCount ?? 0}
        </td>
        <td className="admin-mono">{item.sampleSize ?? 0}</td>
        <td className="admin-mono">{ready ? pct(item.resolvedSuccessRate) : '—'}</td>
        <td className="admin-mono">{ready ? num(item.avgMfeR) : '—'}</td>
        <td className="admin-mono">{ready ? num(item.avgMaeR) : '—'}</td>
        <td>
          <span
            className={`admin-pill ${ready ? 'stats-pill--ready' : 'stats-pill--building'}`}
          >
            {statusLabel}
          </span>
        </td>
        <td>
          <button type="button" className="admin-btn admin-btn--small" onClick={onOpenChart}>
            Chart
          </button>
        </td>
      </tr>
      {open && (
        <tr className="stats-detail-row">
          <td colSpan={11}>
            <div className="stats-detail">
              <div>
                <span className="stats-detail__label">Inventory success %</span>
                <span className="admin-mono">
                  {ready ? pct(item.successRate) : '—'}
                </span>
              </div>
              <div>
                <span className="stats-detail__label">Expired share</span>
                <span className="admin-mono">
                  {item.sampleSize > 0
                    ? pct((item.expiredCount ?? 0) / item.sampleSize)
                    : '—'}
                </span>
              </div>
              <div>
                <span className="stats-detail__label">Resolved n</span>
                <span className="admin-mono">
                  {item.resolvedSampleSize ?? (item.successCount ?? 0) + (item.failCount ?? 0)}
                </span>
              </div>
              <div>
                <span className="stats-detail__label">Avg move (R)</span>
                <span className="admin-mono">{ready ? num(item.avgMoveR) : '—'}</span>
              </div>
              <div>
                <span className="stats-detail__label">Avg duration (bars)</span>
                <span className="admin-mono">
                  {ready ? num(item.avgDurationCandles, 1) : '—'}
                </span>
              </div>
              <div>
                <span className="stats-detail__label">MFE samples</span>
                <span className="admin-mono">{item.mfeSampleSize ?? '—'}</span>
              </div>
              <div>
                <span className="stats-detail__label">MAE samples</span>
                <span className="admin-mono">{item.maeSampleSize ?? '—'}</span>
              </div>
              <div>
                <span className="stats-detail__label">Updated</span>
                <span className="admin-mono">{item.updatedAt || '—'}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

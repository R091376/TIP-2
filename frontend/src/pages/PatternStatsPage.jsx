import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { isPatternResearchStatsEnabled } from '../config/featureFlags'
import {
  fetchPatternStatistics,
  fetchResearchStatistics,
} from '../services/patternStatisticsApi'
import {
  BUILTIN_STACK_PRESETS,
  DEFAULT_MAX_RISK_R,
  DEFAULT_RESEARCH_FILTERS,
  deleteUserPreset,
  loadUserPresets,
  parseResearchFiltersFromSearch,
  researchEarliestDetectYmd,
  researchFilterChips,
  saveUserPreset,
  serializeResearchFilters,
  todayIstYmd,
  withResearchDefaults,
} from '../utils/researchFilters'
import './authPages.css'
import './patternStats.css'

const TIMEFRAMES = ['all', '1m', '5m', '15m', '1h', '4h', '1d']
const RESEARCH_TFS = ['5m', '15m', '1h', '4h', '1d']
const RESEARCH_TYPES = [
  'breakout',
  'breakdown',
  'volume_breakout',
  'consolidation',
  'hammer',
  'shooting_star',
  'bullish_engulfing',
  'bearish_engulfing',
  'inside_bar',
  'higher_high',
  'lower_low',
]
/** Base options; live types from data are merged in. */
const BASE_PATTERN_TYPES = ['all', 'breakout', 'breakdown']

const SORT_OPTIONS = [
  { value: 'expectedR', label: 'Expected R (WR × plan R:R − loss)' },
  { value: 'resolvedSuccessRate', label: 'Resolved success %' },
  { value: 'avgPlannedRr', label: 'Plan R:R (avg reward ÷ avg risk)' },
  { value: 'avgMoveR', label: 'Avg move (ATR)' },
  { value: 'avgRiskR', label: 'Avg risk (R)' },
  { value: 'avgRewardR', label: 'Avg reward (R)' },
  { value: 'sampleSize', label: 'Sample size' },
  { value: 'symbol', label: 'Symbol' },
]

/** Client-side page size for Dashboard + Research tables. */
const PAGE_SIZE = 100

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return `${(Number(value) * 100).toFixed(1)}%`
}

function num(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toFixed(digits)
}

function numSigned(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const n = Number(value)
  const body = n.toFixed(digits)
  return n > 0 ? `+${body}` : body
}

function formatCacheStamp(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }) + ' IST'
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

function computeHighlightKeys(rows, sortKey, minSampleSize) {
  const ready = rows.filter((r) => isReady(r, minSampleSize))
  if (ready.length === 0) return new Set()

  const metric = (r) => {
    if (sortKey === 'expectedR') return r.expectedR
    if (sortKey === 'avgMoveR') return r.avgMoveR
    if (sortKey === 'avgPlannedRr') return r.avgPlannedRr
    if (sortKey === 'avgRiskR') return r.avgRiskR
    if (sortKey === 'avgRewardR') return r.avgRewardR
    if (sortKey === 'sampleSize') return r.sampleSize
    if (sortKey === 'symbol') return null
    if (sortKey === 'resolvedSuccessRate') return r.resolvedSuccessRate
    return r.expectedR
  }

  const scored = ready
    .map((r) => ({ key: rowKey(r), v: metric(r) }))
    .filter((x) => x.v != null && !Number.isNaN(Number(x.v)))

  if (scored.length === 0) return new Set()

  scored.sort((a, b) => b.v - a.v)
  const topN = Math.max(1, Math.ceil(scored.length * 0.25))
  return new Set(scored.slice(0, topN).map((x) => x.key))
}

function sortRows(rows, sortKey, minSampleSize) {
  const copy = [...rows]
  copy.sort((a, b) => {
    const aReady = isReady(a, minSampleSize)
    const bReady = isReady(b, minSampleSize)
    if (sortKey !== 'symbol' && sortKey !== 'sampleSize' && aReady !== bReady) {
      return aReady ? -1 : 1
    }

    const cmpNum = (av, bv) => {
      const aNull = av == null || Number.isNaN(Number(av))
      const bNull = bv == null || Number.isNaN(Number(bv))
      if (aNull && bNull) return 0
      if (aNull) return 1
      if (bNull) return -1
      return Number(bv) - Number(av)
    }

    let primary = 0
    switch (sortKey) {
      case 'expectedR':
        primary = cmpNum(a.expectedR, b.expectedR)
        break
      case 'avgMoveR':
        primary = cmpNum(a.avgMoveR, b.avgMoveR)
        break
      case 'avgPlannedRr':
        primary = cmpNum(a.avgPlannedRr, b.avgPlannedRr)
        break
      case 'avgRiskR':
        primary = cmpNum(a.avgRiskR, b.avgRiskR)
        break
      case 'avgRewardR':
        primary = cmpNum(a.avgRewardR, b.avgRewardR)
        break
      case 'sampleSize':
        primary = cmpNum(a.sampleSize, b.sampleSize)
        break
      case 'symbol':
        primary = symbolLabel(a).localeCompare(symbolLabel(b))
        break
      case 'resolvedSuccessRate':
        primary = cmpNum(a.resolvedSuccessRate, b.resolvedSuccessRate)
        break
      default:
        primary = cmpNum(a.expectedR, b.expectedR)
        break
    }
    if (primary !== 0) return primary

    const edge = cmpNum(a.expectedR, b.expectedR)
    if (edge !== 0) return edge
    const move = cmpNum(a.avgMoveR, b.avgMoveR)
    if (move !== 0) return move
    const n = cmpNum(a.sampleSize, b.sampleSize)
    if (n !== 0) return n
    return symbolLabel(a).localeCompare(symbolLabel(b))
  })
  return copy
}

export default function PatternStatsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAdmin } = useAuth()
  const researchEnabled = isPatternResearchStatsEnabled() && isAdmin

  const modeFromUrl = searchParams.get('mode') === 'research' ? 'research' : 'dashboard'
  const mode = researchEnabled ? modeFromUrl : 'dashboard'

  const [items, setItems] = useState([])
  const [minSampleSize, setMinSampleSize] = useState(20)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  // Dashboard filters
  const [patternType, setPatternType] = useState('all')
  const [timeframe, setTimeframe] = useState('all')
  const [readyOnly, setReadyOnly] = useState(false)
  const [symbolQuery, setSymbolQuery] = useState('')
  const [minExpectedRFilter, setMinExpectedRFilter] = useState('')
  const [minExpectedRText, setMinExpectedRText] = useState(() =>
    researchEnabled && modeFromUrl === 'research'
      ? String(
          withResearchDefaults(parseResearchFiltersFromSearch(searchParams)).minExpectedR ?? '',
        )
      : '',
  )
  const [sortKey, setSortKey] = useState('expectedR')
  const [expanded, setExpanded] = useState(() => new Set())

  // Research — default maxRiskR ≤ 1.5 unless URL/preset overrides
  const [researchDraft, setResearchDraft] = useState(() =>
    mode === 'research'
      ? withResearchDefaults(parseResearchFiltersFromSearch(searchParams))
      : { ...DEFAULT_RESEARCH_FILTERS },
  )
  const [researchApplied, setResearchApplied] = useState(() =>
    mode === 'research'
      ? withResearchDefaults(parseResearchFiltersFromSearch(searchParams))
      : { ...DEFAULT_RESEARCH_FILTERS },
  )
  const [researchSummary, setResearchSummary] = useState(null)
  const [researchMeta, setResearchMeta] = useState(null)
  const [userPresets, setUserPresets] = useState(() => loadUserPresets())

  const setMode = (next) => {
    const sp = new URLSearchParams(searchParams)
    if (next === 'research') {
      sp.set('mode', 'research')
      const qs = serializeResearchFilters(researchApplied)
      // merge research params
      const r = new URLSearchParams(qs)
      for (const [k, v] of r.entries()) sp.set(k, v)
    } else {
      sp.delete('mode')
      // strip research-only keys
      ;[
        'flagConfirmed',
        'flagRetested',
        'flagStrengthened',
        'volumeOkAtDetect',
        'detectTimeIstStart',
        'detectTimeIstEnd',
        'detectedFrom',
        'detectedTo',
        'resolvedOnly',
        'excludeReasons',
        'minPlannedRr',
        'minRiskR',
        'maxRiskR',
        'minExpectedR',
        'requireValidRails',
        'groupBy',
        'direction',
        'confirmationMode',
        'outcome',
        'detectorVersion',
        'limitGroups',
        'minSampleSize',
        'symbolId',
      ].forEach((k) => sp.delete(k))
    }
    setSearchParams(sp, { replace: true })
  }

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = {}
    if (patternType !== 'all') params.patternType = patternType
    if (timeframe !== 'all') params.timeframe = timeframe
    try {
      let data
      try {
        data = await fetchPatternStatistics(params)
      } catch {
        await new Promise((r) => setTimeout(r, 400))
        data = await fetchPatternStatistics(params)
      }
      setItems(Array.isArray(data.items) ? data.items : [])
      setMinSampleSize(data.minSampleSize || 20)
      setResearchSummary(null)
      setResearchMeta(null)
      setError(null)
    } catch (e) {
      setItems([])
      setError(e instanceof Error ? e.message : 'Failed to load pattern statistics')
    } finally {
      setLoading(false)
    }
  }, [patternType, timeframe])

  const loadResearch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchResearchStatistics(researchApplied)
      setItems(Array.isArray(data.items) ? data.items : [])
      setMinSampleSize(data.minSampleSize || 20)
      setResearchSummary(data.summary)
      setResearchMeta({
        totalMatched: data.totalMatched,
        totalGroups: data.totalGroups,
        truncated: data.truncated,
        disclaimer: data.disclaimer,
        filters: data.filters,
        cache: data.cache || null,
      })
      // Hydrate dates from server echo when client omitted them
      const f = data.filters || {}
      if (f.detectedFrom || f.detectedTo) {
        setResearchDraft((d) => ({
          ...d,
          detectedFrom: d.detectedFrom || f.detectedFrom || undefined,
          detectedTo: d.detectedTo || f.detectedTo || undefined,
        }))
      }
      setError(null)
    } catch (e) {
      setItems([])
      setResearchSummary(null)
      setResearchMeta(null)
      setError(e instanceof Error ? e.message : 'Failed to load research statistics')
    } finally {
      setLoading(false)
    }
  }, [researchApplied])

  useEffect(() => {
    if (mode === 'research') {
      void loadResearch()
    } else {
      void loadDashboard()
    }
  }, [mode, loadResearch, loadDashboard])

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
    const minEdge = Number(minExpectedRFilter)
    if (mode === 'dashboard' && minExpectedRFilter !== '' && Number.isFinite(minEdge)) {
      rows = rows.filter((r) => r.expectedR != null && Number(r.expectedR) >= minEdge)
    }
    return sortRows(rows, sortKey, minSampleSize)
  }, [items, readyOnly, symbolQuery, minExpectedRFilter, sortKey, minSampleSize, mode])

  // Reset to page 1 when the visible set or mode changes
  useEffect(() => {
    setPage(1)
  }, [
    mode,
    patternType,
    timeframe,
    readyOnly,
    symbolQuery,
    minExpectedRFilter,
    sortKey,
    researchApplied,
    items,
  ])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, safePage])

  const highlightKeys = useMemo(
    () => computeHighlightKeys(pageSlice, sortKey, minSampleSize),
    [pageSlice, sortKey, minSampleSize],
  )

  const chips = useMemo(
    () => (mode === 'research' ? researchFilterChips(researchApplied) : []),
    [mode, researchApplied],
  )

  function toggleExpand(key) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function applyResearch() {
    setResearchApplied({ ...researchDraft })
    const sp = new URLSearchParams()
    sp.set('mode', 'research')
    const qs = serializeResearchFilters(researchDraft)
    const r = new URLSearchParams(qs)
    for (const [k, v] of r.entries()) sp.set(k, v)
    setSearchParams(sp, { replace: true })
  }

  function applyPreset(filters) {
    // Presets already include maxRiskR; still merge defaults for safety
    const next = withResearchDefaults(filters)
    setResearchDraft({ ...next })
    setResearchApplied({ ...next })
    setMinExpectedRText(next.minExpectedR == null ? '' : String(next.minExpectedR))
    const sp = new URLSearchParams()
    sp.set('mode', 'research')
    const qs = serializeResearchFilters(next)
    const r = new URLSearchParams(qs)
    for (const [k, v] of r.entries()) sp.set(k, v)
    setSearchParams(sp, { replace: true })
  }

  function clearResearch() {
    const next = { ...DEFAULT_RESEARCH_FILTERS }
    setResearchDraft(next)
    setResearchApplied(next)
    setMinExpectedRText('')
    const sp = new URLSearchParams({ mode: 'research' })
    const r = new URLSearchParams(serializeResearchFilters(next))
    for (const [k, v] of r.entries()) sp.set(k, v)
    setSearchParams(sp, { replace: true })
  }

  function onSavePreset() {
    const name = window.prompt('Preset name')
    if (!name || !name.trim()) return
    const id = `user-${Date.now()}`
    saveUserPreset({ id, name: name.trim(), filters: { ...researchApplied } })
    setUserPresets(loadUserPresets())
  }

  const showResearchCols = mode === 'research'
  // expand + symbol + type + tf + sfe + n + expectedR + resolved% + plan + move + risk + reward + status
  const colSpan = 13
  const pageFrom = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const pageTo = Math.min(safePage * PAGE_SIZE, filtered.length)

  return (
    <div className="admin-page admin-page--in-shell stats-page">
      <header className="admin-header">
        <div>
          <h1 className="admin-header__title">Stats · Pattern statistics</h1>
          <p className="admin-header__sub">
            {mode === 'research'
              ? 'Research · composable stack filters · virtual journal outcomes · ADMIN'
              : `Watchlist ranking · rates unlock at n ≥ ${minSampleSize} · not trade advice`}
          </p>
        </div>
        {researchEnabled && (
          <div className="stats-mode-toggle" role="group" aria-label="Stats mode">
            <button
              type="button"
              className={`admin-btn admin-btn--small ${mode === 'dashboard' ? 'stats-mode--active' : ''}`}
              onClick={() => setMode('dashboard')}
            >
              Stats
            </button>
            <button
              type="button"
              className={`admin-btn admin-btn--small ${mode === 'research' ? 'stats-mode--active' : ''}`}
              onClick={() => setMode('research')}
            >
              Research
            </button>
          </div>
        )}
      </header>

      {error && <div className="admin-banner admin-banner--error">{error}</div>}

      {mode === 'research' && researchMeta?.disclaimer && (
        <div className="admin-banner stats-research-disclaimer">{researchMeta.disclaimer}</div>
      )}

      {mode === 'dashboard' && (
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
            <label>
              Min Expected R
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 0.2"
                title="Keep rows whose Expected R (WR × plan R:R − loss rate) is at least this"
                value={minExpectedRFilter}
                onChange={(e) => setMinExpectedRFilter(e.target.value)}
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
                onClick={() => void loadDashboard()}
                disabled={loading}
              >
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>
          <p className="stats-legend">
            Highlight = top quartile among <strong>Ready</strong> rows for current sort. S / F / E =
            success / fail / expired. <strong>Expected R</strong> = Resolved % × Plan R:R − (1 −
            Resolved %). Assumes a win collects the plan and a loss costs 1R. MFE / MAE are in the
            row detail.
          </p>
        </section>
      )}

      {mode === 'research' && (
        <section className="admin-card rf">
          {/* Sticky action bar */}
          <div className="rf-toolbar">
            <div className="rf-toolbar__left">
              <span className="rf-toolbar__title">Stack filters</span>
              {chips.length > 0 && (
                <span className="rf-toolbar__count">{chips.length} active</span>
              )}
            </div>
            <div className="rf-toolbar__right">
              <button
                type="button"
                className="admin-btn rf-toolbar__apply"
                onClick={applyResearch}
                disabled={loading}
              >
                {loading ? 'Loading…' : 'Apply'}
              </button>
              <button type="button" className="admin-btn admin-btn--small" onClick={clearResearch}>
                Clear
              </button>
              <button type="button" className="admin-btn admin-btn--small" onClick={onSavePreset}>
                Save
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--small"
                onClick={() => {
                  const url = `${window.location.origin}${window.location.pathname}?${new URLSearchParams({ mode: 'research', ...Object.fromEntries(new URLSearchParams(serializeResearchFilters(researchApplied))) }).toString()}`
                  void navigator.clipboard?.writeText(url)
                }}
              >
                Link
              </button>
            </div>
          </div>

          {/* Form: fixed label column (property sheet) */}
          <div className="rf-body">
            <div className="rf-row">
              <div className="rf-key">Preset</div>
              <div className="rf-val rf-val--split">
                <select
                  className="rf-control"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value
                    if (!id) return
                    const all = [...BUILTIN_STACK_PRESETS, ...userPresets]
                    const p = all.find((x) => x.id === id)
                    if (p) applyPreset(p.filters)
                    e.target.value = ''
                  }}
                >
                  <option value="">Load a stack preset…</option>
                  <optgroup label="Built-in">
                    {BUILTIN_STACK_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                  {userPresets.length > 0 && (
                    <optgroup label="Saved">
                      {userPresets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {userPresets.length > 0 && (
                  <select
                    className="rf-control rf-control--narrow"
                    value=""
                    aria-label="Delete saved preset"
                    onChange={(e) => {
                      const id = e.target.value
                      if (!id) return
                      deleteUserPreset(id)
                      setUserPresets(loadUserPresets())
                      e.target.value = ''
                    }}
                  >
                    <option value="">Delete saved…</option>
                    {userPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="rf-row">
              <div className="rf-key">Direction</div>
              <div className="rf-val rf-val--3">
                <select
                  className="rf-control"
                  value={researchDraft.direction || ''}
                  onChange={(e) =>
                    setResearchDraft((d) => ({
                      ...d,
                      direction: e.target.value || undefined,
                    }))
                  }
                >
                  <option value="">Any</option>
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
                <select
                  className="rf-control"
                  value={researchDraft.groupBy || 'symbol,patternType,timeframe'}
                  onChange={(e) =>
                    setResearchDraft((d) => ({ ...d, groupBy: e.target.value }))
                  }
                  aria-label="Group by"
                  title="Group by"
                >
                  <option value="symbol,patternType,timeframe">Group: Symbol · type · TF</option>
                  <option value="patternType,timeframe">Group: Type · TF</option>
                  <option value="patternType">Group: Type only</option>
                  <option value="none">Group: Global</option>
                </select>
                <input
                  className="rf-control"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Min plan R:R"
                  title="Min planned reward÷risk (implies valid rails)"
                  value={researchDraft.minPlannedRr ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setResearchDraft((d) => ({
                      ...d,
                      minPlannedRr: v === '' ? undefined : Number(v),
                    }))
                  }}
                />
              </div>
            </div>

            <div className="rf-row">
              <div className="rf-key">Expected R</div>
              <div className="rf-val rf-val--3">
                <input
                  className="rf-control"
                  type="number"
                  step="0.1"
                  placeholder="Min Expected R"
                  title="Keep groups whose Expected R (Resolved % × Plan R:R − loss rate) is at least this. Applied after grouping."
                  value={minExpectedRText}
                  onChange={(e) => {
                    const v = e.target.value
                    const n = Number(v)
                    setMinExpectedRText(v)
                    setResearchDraft((d) => ({
                      ...d,
                      minExpectedR: v.trim() === '' || !Number.isFinite(n) ? undefined : n,
                    }))
                  }}
                />
                <span className="rf-hint rf-hint--inline">
                  WR × plan R:R − (1 − WR) · empty = no floor
                </span>
              </div>
            </div>

            <div className="rf-row">
              <div className="rf-key">Rails (ATR)</div>
              <div className="rf-val rf-val--3">
                <input
                  className="rf-control"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Min risk R"
                  title="Min planned stop distance in ATR (risk_r). Implies valid rails. Prefer ≥0.5 to avoid tiny-stop artifacts."
                  value={researchDraft.minRiskR ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setResearchDraft((d) => ({
                      ...d,
                      minRiskR: v === '' ? undefined : Number(v),
                    }))
                  }}
                />
                <input
                  className="rf-control"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder={`Max risk R (default ${DEFAULT_MAX_RISK_R})`}
                  title={`Max planned stop distance in ATR (risk_r). Default ${DEFAULT_MAX_RISK_R} so risk stays ≤ ${DEFAULT_MAX_RISK_R}. Implies valid rails.`}
                  value={researchDraft.maxRiskR ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setResearchDraft((d) => ({
                      ...d,
                      maxRiskR: v === '' ? undefined : Number(v),
                    }))
                  }}
                />
                <label className="rf-check" title="Exclude setups without a valid entry/stop/target offer">
                  <input
                    type="checkbox"
                    checked={!!researchDraft.requireValidRails}
                    onChange={(e) =>
                      setResearchDraft((d) => ({
                        ...d,
                        requireValidRails: e.target.checked ? true : undefined,
                      }))
                    }
                  />
                  Valid rails
                </label>
              </div>
            </div>
            <p className="rf-hint">
              Risk R = |entry−stop|÷ATR. Plan R:R = reward÷risk. Expected R uses those two with
              Resolved % — it is the ranking number, not ATR move.
            </p>

            <div className="rf-row">
              <div className="rf-key">Detect window</div>
              <div className="rf-val rf-val--4">
                <input
                  className="rf-control"
                  type="date"
                  title="From (IST)"
                  aria-label="Detect from IST"
                  min={researchEarliestDetectYmd()}
                  max={todayIstYmd()}
                  value={researchDraft.detectedFrom || ''}
                  onChange={(e) =>
                    setResearchDraft((d) => ({
                      ...d,
                      detectedFrom: e.target.value || undefined,
                    }))
                  }
                />
                <input
                  className="rf-control"
                  type="date"
                  title="To (IST)"
                  aria-label="Detect to IST"
                  min={researchEarliestDetectYmd()}
                  max={todayIstYmd()}
                  value={researchDraft.detectedTo || ''}
                  onChange={(e) =>
                    setResearchDraft((d) => ({
                      ...d,
                      detectedTo: e.target.value || undefined,
                    }))
                  }
                />
                <input
                  className="rf-control"
                  type="time"
                  title="Session start IST"
                  aria-label="Session start"
                  value={researchDraft.detectTimeIstStart || ''}
                  onChange={(e) =>
                    setResearchDraft((d) => ({
                      ...d,
                      detectTimeIstStart: e.target.value || undefined,
                    }))
                  }
                />
                <input
                  className="rf-control"
                  type="time"
                  title="Session end IST"
                  aria-label="Session end"
                  value={researchDraft.detectTimeIstEnd || ''}
                  onChange={(e) =>
                    setResearchDraft((d) => ({
                      ...d,
                      detectTimeIstEnd: e.target.value || undefined,
                    }))
                  }
                />
              </div>
            </div>
            <div className="rf-row rf-row--hint">
              <div className="rf-key" />
              <div className="rf-val rf-hint">
                Dates · session times (IST candle). Empty dates → last 180 days. Oldest
                allowed date is 180 days back. Session filter excludes 1d.
              </div>
            </div>

            <div className="rf-row">
              <div className="rf-key">Quality</div>
              <div className="rf-val">
                <div className="rf-seg" role="group" aria-label="Quality stack">
                  {[
                    {
                      key: 'c',
                      label: 'Confirmed',
                      on: researchDraft.flagConfirmed === true,
                      toggle: () =>
                        setResearchDraft((d) => ({
                          ...d,
                          flagConfirmed: d.flagConfirmed ? undefined : true,
                        })),
                    },
                    {
                      key: 'r',
                      label: 'Retested',
                      on: researchDraft.flagRetested === true,
                      toggle: () =>
                        setResearchDraft((d) => ({
                          ...d,
                          flagRetested: d.flagRetested ? undefined : true,
                        })),
                    },
                    {
                      key: 's',
                      label: 'Strengthened',
                      on: researchDraft.flagStrengthened === true,
                      toggle: () =>
                        setResearchDraft((d) => ({
                          ...d,
                          flagStrengthened: d.flagStrengthened ? undefined : true,
                        })),
                    },
                    {
                      key: 'v',
                      label: 'Volume OK',
                      on: researchDraft.volumeOkAtDetect === true,
                      toggle: () =>
                        setResearchDraft((d) => ({
                          ...d,
                          volumeOkAtDetect: d.volumeOkAtDetect ? undefined : true,
                        })),
                    },
                    {
                      key: 'o',
                      label: 'Resolved',
                      on: researchDraft.resolvedOnly === true,
                      toggle: () =>
                        setResearchDraft((d) => ({
                          ...d,
                          resolvedOnly: d.resolvedOnly ? undefined : true,
                        })),
                    },
                    {
                      key: 'x',
                      label: '− Recovery',
                      on: (researchDraft.excludeReasons || []).includes('startup_recovery'),
                      toggle: () =>
                        setResearchDraft((d) => {
                          const cur = new Set(d.excludeReasons || [])
                          if (cur.has('startup_recovery')) cur.delete('startup_recovery')
                          else cur.add('startup_recovery')
                          const arr = [...cur]
                          return { ...d, excludeReasons: arr.length ? arr : undefined }
                        }),
                    },
                  ].map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      className={`rf-seg__btn ${b.on ? 'is-on' : ''}`}
                      aria-pressed={b.on}
                      onClick={b.toggle}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rf-row rf-row--top">
              <div className="rf-key">Universe</div>
              <div className="rf-val rf-val--2">
                <div className="rf-subfield">
                  <span className="rf-subfield__label">Timeframes</span>
                  <select
                    className="rf-control rf-control--multi"
                    multiple
                    size={Math.min(6, RESEARCH_TFS.length)}
                    value={researchDraft.timeframe || []}
                    onChange={(e) => {
                      const selected = [...e.target.selectedOptions].map((o) => o.value)
                      setResearchDraft((d) => ({
                        ...d,
                        timeframe: selected.length ? selected : undefined,
                      }))
                    }}
                  >
                    {RESEARCH_TFS.map((tf) => (
                      <option key={tf} value={tf}>
                        {tf}
                      </option>
                    ))}
                  </select>
                  <span className="rf-hint rf-hint--inline">Ctrl/Cmd+click · empty = all</span>
                </div>
                <div className="rf-subfield">
                  <span className="rf-subfield__label">Patterns</span>
                  <select
                    className="rf-control rf-control--multi rf-control--multi-tall"
                    multiple
                    size={6}
                    value={researchDraft.patternType || []}
                    onChange={(e) => {
                      const selected = [...e.target.selectedOptions].map((o) => o.value)
                      setResearchDraft((d) => ({
                        ...d,
                        patternType: selected.length ? selected : undefined,
                      }))
                    }}
                  >
                    {RESEARCH_TYPES.map((pt) => (
                      <option key={pt} value={pt}>
                        {pt.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="rf-row">
              <div className="rf-key">Table</div>
              <div className="rf-val rf-val--2">
                <div className="rf-subfield">
                  <span className="rf-subfield__label">Sort</span>
                  <select
                    className="rf-control"
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value)}
                    aria-label="Sort table"
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rf-subfield rf-subfield--check">
                  <span className="rf-subfield__label">Ready only</span>
                  <label className="rf-check">
                    <input
                      type="checkbox"
                      checked={readyOnly}
                      onChange={(e) => setReadyOnly(e.target.checked)}
                    />
                    n ≥ {minSampleSize}
                  </label>
                </div>
              </div>
            </div>
            <p className="rf-hint">
              <strong>Expected R</strong> = Resolved % × Plan R:R − (1 − Resolved %). A win is assumed
              to collect the plan; a loss costs 1R. Default and all presets cap risk at ≤{' '}
              {DEFAULT_MAX_RISK_R} ATR. MFE / MAE / win-loss path live in the row detail.
            </p>

            {chips.length > 0 && (
              <div className="rf-row">
                <div className="rf-key">Applied</div>
                <div className="rf-val">
                  <div className="rf-tags">
                    {chips.map((c) => (
                      <span key={c.key} className="rf-tag">
                        {c.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {mode === 'research' && researchSummary && (
        <section className="admin-card stats-summary">
          <div className="stats-summary__grid">
            <div>
              <span className="stats-detail__label">Matched n</span>
              <strong className="admin-mono">{researchMeta?.totalMatched ?? researchSummary.sampleSize}</strong>
            </div>
            <div>
              <span className="stats-detail__label">S / F / E</span>
              <strong className="admin-mono">
                {researchSummary.successCount} / {researchSummary.failCount} /{' '}
                {researchSummary.expiredCount}
              </strong>
            </div>
            <div>
              <span className="stats-detail__label">Resolved %</span>
              <strong className="admin-mono">{pct(researchSummary.resolvedSuccessRate)}</strong>
            </div>
            <div>
              <span
                className="stats-detail__label"
                title="Resolved % × Plan R:R − (1 − Resolved %)"
              >
                Expected R
              </span>
              <strong className="admin-mono">{numSigned(researchSummary.expectedR)}</strong>
            </div>
            <div>
              <span className="stats-detail__label">Plan R:R</span>
              <strong className="admin-mono">
                {researchSummary.avgPlannedRr != null
                  ? `${num(researchSummary.avgPlannedRr)}×`
                  : '—'}
              </strong>
            </div>
            <div>
              <span className="stats-detail__label">Ready groups</span>
              <strong className="admin-mono">{researchSummary.readyGroupCount}</strong>
            </div>
            <div>
              <span className="stats-detail__label">Scan (IST)</span>
              <strong className="admin-mono">
                {researchSummary.scannedFrom || '—'} → {researchSummary.scannedTo || '—'}
              </strong>
            </div>
            {researchMeta?.truncated && (
              <div>
                <span className="stats-detail__label">Truncated</span>
                <strong>yes ({researchMeta.totalGroups} groups)</strong>
              </div>
            )}
          </div>
          {researchMeta?.cache && (
            <p className="stats-summary__cache" title="Closed journal rows loaded once per day; filter changes run in memory">
              {researchMeta.cache.hit
                ? `Snapshot ${formatCacheStamp(researchMeta.cache.loadedAt)} · ${(researchMeta.cache.rowCount ?? 0).toLocaleString()} rows · filters in memory`
                : 'Live database query (snapshot unavailable)'}
            </p>
          )}
        </section>
      )}

      <section className="admin-card">
        <div className="admin-card__head">
          <h2>{mode === 'research' ? 'Filtered groups' : 'Buckets'}</h2>
          <span className="stats-count">
            {loading
              ? '…'
              : filtered.length === 0
                ? '0 rows'
                : `${pageFrom}–${pageTo} of ${filtered.length}`}
          </span>
        </div>

        {!loading && filtered.length === 0 && (
          <p className="admin-empty">
            {mode === 'research'
              ? 'No matching closed outcomes for these filters (Postgres journal required). Try a wider date range or fewer stack filters.'
              : 'No statistics rows yet. Pattern journal needs Postgres + closed outcomes on the watchlist.'}
          </p>
        )}

        {filtered.length > 0 && (
          <>
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
                    <th title="Resolved % × Plan R:R − (1 − Resolved %)">Expected R</th>
                    <th>Resolved %</th>
                    <th title="avg(reward in R) ÷ avg(risk in R)">Plan R:R</th>
                    <th title="Average terminal move vs entry, in ATR units">Move (ATR)</th>
                    <th>Risk (R)</th>
                    <th>Reward (R)</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.map((item) => {
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
                        showResearchCols={showResearchCols}
                        colSpan={colSpan}
                        onToggle={() => toggleExpand(key)}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="stats-pager" role="navigation" aria-label="Table pagination">
                <button
                  type="button"
                  className="admin-btn admin-btn--small"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="stats-pager__meta">
                  Page {safePage} of {totalPages}
                  <span className="stats-pager__size"> · {PAGE_SIZE} / page</span>
                </span>
                <button
                  type="button"
                  className="admin-btn admin-btn--small"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function FragmentRow({
  item,
  ready,
  open,
  highlight,
  minSampleSize,
  showResearchCols,
  colSpan,
  onToggle,
}) {
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
        <td className="admin-mono">
          {ready ? numSigned(item.expectedR) : '—'}
        </td>
        <td className="admin-mono">{ready ? pct(item.resolvedSuccessRate) : '—'}</td>
        <td className="admin-mono">
          {ready && item.avgPlannedRr != null ? `${num(item.avgPlannedRr)}×` : '—'}
        </td>
        <td className="admin-mono">{ready ? num(item.avgMoveR) : '—'}</td>
        <td className="admin-mono">{ready ? num(item.avgRiskR) : '—'}</td>
        <td className="admin-mono">{ready ? num(item.avgRewardR) : '—'}</td>
        <td>
          <span
            className={`admin-pill ${ready ? 'stats-pill--ready' : 'stats-pill--building'}`}
          >
            {statusLabel}
          </span>
        </td>
      </tr>
      {open && (
        <tr className="stats-detail-row">
          <td colSpan={colSpan}>
            <div className="stats-detail">
              <div>
                <span className="stats-detail__label">Inventory success %</span>
                <span className="admin-mono">{ready ? pct(item.successRate) : '—'}</span>
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
                <span className="stats-detail__label">Avg duration (bars)</span>
                <span className="admin-mono">
                  {ready ? num(item.avgDurationCandles, 1) : '—'}
                </span>
              </div>
              <div>
                <span className="stats-detail__label">MFE (R)</span>
                <span className="admin-mono">{ready ? num(item.avgMfeR) : '—'}</span>
              </div>
              <div>
                <span className="stats-detail__label">MAE (R)</span>
                <span className="admin-mono">{ready ? num(item.avgMaeR) : '—'}</span>
              </div>
              <div>
                <span className="stats-detail__label">MFE samples</span>
                <span className="admin-mono">{item.mfeSampleSize ?? '—'}</span>
              </div>
              <div>
                <span className="stats-detail__label">MAE samples</span>
                <span className="admin-mono">{item.maeSampleSize ?? '—'}</span>
              </div>
              {showResearchCols && (
                <div>
                  <span className="stats-detail__label">Win (R)</span>
                  <span className="admin-mono">{ready ? num(item.avgWinMoveR) : '—'}</span>
                </div>
              )}
              {showResearchCols && (
                <div>
                  <span className="stats-detail__label">Loss (R)</span>
                  <span className="admin-mono">{ready ? num(item.avgLossMoveR) : '—'}</span>
                </div>
              )}
              <div>
                <span className="stats-detail__label">Planned R:R samples</span>
                <span className="admin-mono">{item.plannedRrSampleSize ?? '—'}</span>
              </div>
              <div>
                <span className="stats-detail__label">Min plan R:R</span>
                <span className="admin-mono">
                  {ready && item.minPlannedRr != null ? `${num(item.minPlannedRr)}×` : '—'}
                </span>
              </div>
              <div>
                <span className="stats-detail__label">Median plan R:R</span>
                <span className="admin-mono">
                  {ready && item.medianPlannedRr != null
                    ? `${num(item.medianPlannedRr)}×`
                    : '—'}
                </span>
              </div>
              <div>
                <span className="stats-detail__label">Max plan R:R</span>
                <span className="admin-mono">
                  {ready && item.maxPlannedRr != null ? `${num(item.maxPlannedRr)}×` : '—'}
                </span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

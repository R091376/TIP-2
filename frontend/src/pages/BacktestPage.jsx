import { useCallback, useEffect, useMemo, useState } from 'react'
import { PATTERN_TYPE_IDS, formatPatternTypeLabel } from '../utils/patternCatalog'
import { searchInstruments } from '../services/instrumentsApi'
import {
  clearBacktestRuns,
  createBacktestRun,
  getBacktestRun,
  listBacktestRuns,
} from '../services/backtestApi'
import './backtest.css'

const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d']

function todayYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function daysAgoYmd(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function pct(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return `${(Number(v) * 100).toFixed(1)}%`
}

function retPct(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  const n = Number(v) * 100
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${Math.abs(n).toFixed(2)}%`
}

function inr(v) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function num(v, digits = 2) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toFixed(digits)
}

function tradeNotional(t) {
  const px = Number(t?.fillEntry ?? t?.entry)
  const q = Math.max(1, Number(t?.qty) || 1)
  if (!Number.isFinite(px) || px <= 0) return null
  return Math.abs(px) * q
}

function tradePnl(t) {
  const p = Number(t?.pnl)
  return Number.isFinite(p) ? p : null
}

function tradePnlPct(t) {
  if (t?.pnlPct != null && Number.isFinite(Number(t.pnlPct))) return Number(t.pnlPct)
  const p = tradePnl(t)
  const n = tradeNotional(t)
  if (p == null || !n) return null
  return p / n
}

function formatTs(epoch) {
  if (!epoch) return '—'
  const d = new Date(Number(epoch) * 1000)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function symbolLabels(spec) {
  const keys = spec?.symbols || []
  const map = spec?.tradingSymbols || {}
  return keys.map((k) => map[k] || k.split('|').pop() || k)
}

function specRows(spec) {
  if (!spec || typeof spec !== 'object') return []
  const trade = spec.trade || {}
  const names = symbolLabels(spec)
  const types = (spec.patternTypes || []).map((t) => formatPatternTypeLabel(t))
  return [
    ['Symbols', names.length ? names.join(', ') : '—'],
    ['Timeframe', (spec.timeframes || []).join(', ') || '—'],
    ['Patterns', types.length ? types.join(', ') : '—'],
    ['Dates', [spec.fromDate, spec.toDate].filter(Boolean).join(' → ') || '—'],
    [
      'Session',
      spec.sessionStart || spec.sessionEnd
        ? `${spec.sessionStart || 'open'}–${spec.sessionEnd || 'close'} IST`
        : 'full session',
    ],
    ['Target ×ATR', spec.targetR != null ? String(spec.targetR) : 'live default'],
    [
      'Risk ×ATR',
      [spec.minRiskR != null ? `min ${spec.minRiskR}` : null, spec.maxRiskR != null ? `max ${spec.maxRiskR}` : null]
        .filter(Boolean)
        .join(' · ') || 'live default',
    ],
    ['Product', trade.product || '—'],
    ['Qty', trade.qty ?? '—'],
    [
      'Filters',
      [
        spec.requireVolume ? 'volume OK' : null,
        spec.requireRetest ? 'retested' : null,
        spec.requireReclaimed ? 'reclaimed' : null,
        spec.requireConfirmed ? 'confirmed' : null,
        trade.onePosition ? 'one position' : null,
      ]
        .filter(Boolean)
        .join(' · ') || 'none',
    ],
  ]
}

function specChipLabel(spec) {
  if (!spec || typeof spec !== 'object') return ''
  const names = symbolLabels(spec).slice(0, 3)
  const extra = symbolLabels(spec).length - names.length
  const namePart = names.join(' ') + (extra > 0 ? ` +${extra}` : '')
  const tf = (spec.timeframes || [])[0] || ''
  const tgt = spec.targetR != null ? `${spec.targetR}×ATR` : ''
  const range = [spec.fromDate, spec.toDate].filter(Boolean).join('–')
  return [namePart, tf, tgt, range].filter(Boolean).join(' · ')
}

function optPositiveNumber(raw) {
  if (raw === '' || raw == null) return undefined
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function wrTone(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 'muted'
  if (n >= 0.5) return 'good'
  if (n >= 0.4) return 'warn'
  return 'bad'
}

function Metric({ label, value, tone = 'muted' }) {
  return (
    <div className={`bt-metric bt-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default function BacktestPage() {
  const [symbols, setSymbols] = useState([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState([])
  const [timeframe, setTimeframe] = useState('5m')
  const [types, setTypes] = useState(['breakout'])
  const [fromDate, setFromDate] = useState(() => daysAgoYmd(90))
  const [toDate, setToDate] = useState(() => todayYmd())
  const [sessionStart, setSessionStart] = useState('09:30')
  const [sessionEnd, setSessionEnd] = useState('15:00')
  const [targetR, setTargetR] = useState('2')
  const [minRiskR, setMinRiskR] = useState('0.5')
  const [maxRiskR, setMaxRiskR] = useState('1.5')
  const [product, setProduct] = useState('MIS')
  const [qty, setQty] = useState('1')
  const [requireVolume, setRequireVolume] = useState(false)
  const [requireRetest, setRequireRetest] = useState(false)
  const [requireReclaimed, setRequireReclaimed] = useState(false)
  const [requireConfirmed, setRequireConfirmed] = useState(false)
  const [onePosition, setOnePosition] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [active, setActive] = useState(null)
  const [runs, setRuns] = useState([])

  const labels = useMemo(() => {
    const m = {}
    for (const s of symbols) m[s.instrumentKey] = s.tradingSymbol
    return m
  }, [symbols])

  const refreshRuns = useCallback(async () => {
    try {
      const items = await listBacktestRuns(20)
      setRuns(items)
    } catch {
      /* list is secondary */
    }
  }, [])

  useEffect(() => {
    void refreshRuns()
  }, [refreshRuns])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      return undefined
    }
    const ac = new AbortController()
    const t = setTimeout(() => {
      searchInstruments(q, 8, ac.signal)
        .then((rows) => setHits(Array.isArray(rows) ? rows : []))
        .catch(() => setHits([]))
    }, 200)
    return () => {
      ac.abort()
      clearTimeout(t)
    }
  }, [query])

  function addSymbol(hit) {
    setSymbols((prev) => {
      if (prev.some((s) => s.instrumentKey === hit.instrumentKey)) return prev
      return [...prev, hit]
    })
    setQuery('')
    setHits([])
  }

  function removeSymbol(key) {
    setSymbols((prev) => prev.filter((s) => s.instrumentKey !== key))
  }

  function toggleType(id) {
    setTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }

  async function onRun(e) {
    e.preventDefault()
    setError(null)
    if (!symbols.length) {
      setError('Pick at least one symbol (search NSE, not limited to the watchlist).')
      return
    }
    if (!types.length) {
      setError('Pick at least one pattern type.')
      return
    }
    const minR = minRiskR === '' ? null : Number(minRiskR)
    const maxR = maxRiskR === '' ? null : Number(maxRiskR)
    if (minR != null && maxR != null && minR > maxR) {
      setError('Min risk must be ≤ max risk.')
      return
    }
    const tgt = optPositiveNumber(targetR)
    if (targetR !== '' && tgt == null) {
      setError('Target ×ATR must be > 0, or leave empty for each pattern’s live default.')
      return
    }
    setBusy(true)
    try {
      const created = await createBacktestRun({
        symbols: symbols.map((s) => s.instrumentKey),
        timeframes: [timeframe],
        patternTypes: types,
        fromDate,
        toDate,
        sessionStart: sessionStart || undefined,
        sessionEnd: sessionEnd || undefined,
        targetR: tgt,
        minRiskR: minRiskR === '' ? undefined : Number(minRiskR),
        maxRiskR: maxRiskR === '' ? undefined : Number(maxRiskR),
        requireVolume,
        requireRetest,
        requireReclaimed,
        requireConfirmed,
        tradingSymbols: labels,
        trade: {
          enabled: true,
          product,
          qty: Math.max(1, Number(qty) || 1),
          stopWins: true,
          onePosition,
        },
      })
      setActive(created)
      const deadline = Date.now() + 180_000
      let current = created
      while (Date.now() < deadline && ['queued', 'running'].includes(current.status)) {
        await new Promise((r) => setTimeout(r, 600))
        current = await getBacktestRun(created.id)
        setActive(current)
      }
      await refreshRuns()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed')
    } finally {
      setBusy(false)
    }
  }

  async function onClearResults() {
    if (
      !window.confirm(
        'Delete all backtest runs and trades from the database? Candle history is kept.',
      )
    ) {
      return
    }
    setError(null)
    setBusy(true)
    try {
      await clearBacktestRuns()
      setActive(null)
      setRuns([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed')
    } finally {
      setBusy(false)
    }
  }

  function hydrateForm(spec) {
    if (!spec || typeof spec !== 'object') return
    const map = spec.tradingSymbols || {}
    if (Array.isArray(spec.symbols)) {
      setSymbols(
        spec.symbols.map((instrumentKey) => ({
          instrumentKey,
          tradingSymbol: map[instrumentKey] || String(instrumentKey).split('|').pop(),
        })),
      )
    }
    if (spec.timeframes?.[0]) setTimeframe(spec.timeframes[0])
    if (Array.isArray(spec.patternTypes) && spec.patternTypes.length) {
      setTypes(spec.patternTypes)
    }
    if (spec.fromDate) setFromDate(spec.fromDate)
    if (spec.toDate) setToDate(spec.toDate)
    setSessionStart(spec.sessionStart || '')
    setSessionEnd(spec.sessionEnd || '')
    setTargetR(spec.targetR == null ? '' : String(spec.targetR))
    setMinRiskR(spec.minRiskR == null ? '' : String(spec.minRiskR))
    setMaxRiskR(spec.maxRiskR == null ? '' : String(spec.maxRiskR))
    const trade = spec.trade || {}
    if (trade.product) setProduct(trade.product)
    if (trade.qty != null) setQty(String(trade.qty))
    setRequireVolume(!!spec.requireVolume)
    setRequireRetest(!!spec.requireRetest)
    setRequireReclaimed(!!spec.requireReclaimed)
    setRequireConfirmed(!!spec.requireConfirmed)
    setOnePosition(!!trade.onePosition)
  }

  async function openRun(id) {
    const row = await getBacktestRun(id)
    setActive(row)
    hydrateForm(row.spec)
  }

  const summary = active?.summary || {}
  const trades = active?.trades || []
  const usedSpec = active?.spec || summary.spec || null
  const usedRows = specRows(usedSpec)
  const filledTrades = trades.filter((t) => t.outcome && t.outcome !== 'no_fill')
  const runPnl =
    summary.pnl != null && Number.isFinite(Number(summary.pnl))
      ? Number(summary.pnl)
      : filledTrades.reduce((s, t) => s + (tradePnl(t) || 0), 0)
  const runDeployed = filledTrades.reduce((s, t) => s + (tradeNotional(t) || 0), 0)
  const runPnlPct =
    summary.pnlPct != null && Number.isFinite(Number(summary.pnlPct))
      ? Number(summary.pnlPct)
      : runDeployed > 0
        ? runPnl / runDeployed
        : null
  const pnlTone = runPnl > 0 ? 'good' : runPnl < 0 ? 'bad' : 'warn'

  return (
    <div className="bt-page">
      <header className="bt-hero">
        <div className="bt-hero__copy">
          <p className="bt-kicker">Pattern replay</p>
          <h1>Backtest</h1>
          <p>
            Same detectors as live. Detect → next bar open is the buy. Stop wins if
            both print. Retest and confirmed are flags only — they never move entry
            or target.
          </p>
        </div>
        <button
          type="button"
          className="bt-btn bt-btn--ghost"
          disabled={busy}
          onClick={() => void onClearResults()}
        >
          Clear results
        </button>
      </header>

      <form className="bt-form" onSubmit={onRun}>
        <section className="bt-card">
          <div className="bt-card__head">
            <span className="bt-dot" />
            Universe
          </div>
          <label className="bt-field bt-field--grow">
            Search symbols
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type an NSE name — not watchlist-only"
              autoComplete="off"
            />
          </label>
          {hits.length > 0 && (
            <ul className="bt-hits">
              {hits.map((h) => (
                <li key={h.instrumentKey}>
                  <button type="button" onClick={() => addSymbol(h)}>
                    <strong>{h.tradingSymbol}</strong>
                    <span>{h.displayName || h.instrumentKey}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="bt-chips">
            {symbols.length === 0 && <span className="bt-chips__empty">No symbols yet</span>}
            {symbols.map((s) => (
              <button
                key={s.instrumentKey}
                type="button"
                className="bt-chip"
                onClick={() => removeSymbol(s.instrumentKey)}
              >
                {s.tradingSymbol}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        </section>

        <section className="bt-card">
          <div className="bt-card__head">
            <span className="bt-dot" />
            Window
          </div>
          <div className="bt-grid bt-grid--4">
            <label className="bt-field">
              From
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="bt-field">
              To
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
            <label className="bt-field">
              Session start
              <input
                type="time"
                value={sessionStart}
                onChange={(e) => setSessionStart(e.target.value)}
              />
            </label>
            <label className="bt-field">
              Session end
              <input
                type="time"
                value={sessionEnd}
                onChange={(e) => setSessionEnd(e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="bt-card">
          <div className="bt-card__head">
            <span className="bt-dot" />
            Rails
          </div>
          <div className="bt-grid bt-grid--6">
            <label className="bt-field">
              Timeframe
              <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                {TIMEFRAMES.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="bt-field"
              title="Take-profit distance in ATR for every selected pattern. Empty = each type’s live default. Frozen at detect."
            >
              Target ×ATR
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={targetR}
                onChange={(e) => setTargetR(e.target.value)}
                placeholder="live default"
              />
            </label>
            <label
              className="bt-field"
              title="Min planned stop |entry−stop| ÷ ATR. Empty = live default 0.3."
            >
              Min risk ×ATR
              <input
                type="number"
                min="0"
                step="0.1"
                value={minRiskR}
                onChange={(e) => setMinRiskR(e.target.value)}
              />
            </label>
            <label className="bt-field" title="Max planned stop in ATR. Empty = no cap.">
              Max risk ×ATR
              <input
                type="number"
                min="0"
                step="0.1"
                value={maxRiskR}
                onChange={(e) => setMaxRiskR(e.target.value)}
              />
            </label>
            <label className="bt-field">
              Product
              <select value={product} onChange={(e) => setProduct(e.target.value)}>
                <option value="MIS">MIS</option>
                <option value="CNC">CNC</option>
              </select>
            </label>
            <label className="bt-field">
              Qty
              <input
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
          </div>
          <div className="bt-toggles">
            <button
              type="button"
              className={`bt-toggle${onePosition ? ' is-on' : ''}`}
              aria-pressed={onePosition}
              title="Skip a new entry on a symbol while a simulated trade is still open on it."
              onClick={() => setOnePosition((v) => !v)}
            >
              One position
            </button>
          </div>
        </section>

        <section className="bt-card">
          <div className="bt-card__head">
            <span className="bt-dot" />
            Patterns
          </div>
          <div className="bt-pills">
            {PATTERN_TYPE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`bt-pill${types.includes(id) ? ' is-on' : ''}`}
                onClick={() => toggleType(id)}
                aria-pressed={types.includes(id)}
              >
                {formatPatternTypeLabel(id)}
              </button>
            ))}
          </div>
          <div className="bt-toggles">
            <button
              type="button"
              className={`bt-toggle${requireVolume ? ' is-on' : ''}`}
              aria-pressed={requireVolume}
              title="Only take setups that had volume_ok at detect (bar volume vs average). Same flag as Stats."
              onClick={() => setRequireVolume((v) => !v)}
            >
              Volume OK
            </button>
            <button
              type="button"
              className={`bt-toggle${requireRetest ? ' is-on' : ''}`}
              aria-pressed={requireRetest}
              title="Keep trades whose setup retested. Fill is still the next open after detect."
              onClick={() => setRequireRetest((v) => !v)}
            >
              Retested
            </button>
            <button
              type="button"
              className={`bt-toggle${requireReclaimed ? ' is-on' : ''}`}
              aria-pressed={requireReclaimed}
              title="Keep trades whose setup reclaimed (close back through detect entry after a retest). Fill is still the next open after detect."
              onClick={() => setRequireReclaimed((v) => !v)}
            >
              Reclaimed
            </button>
            <button
              type="button"
              className={`bt-toggle${requireConfirmed ? ' is-on' : ''}`}
              aria-pressed={requireConfirmed}
              title="Keep trades whose setup confirmed. Fill is still the next open after detect."
              onClick={() => setRequireConfirmed((v) => !v)}
            >
              Confirmed
            </button>
          </div>
        </section>

        {error && <p className="bt-error">{error}</p>}

        <div className="bt-runrow">
          <button type="submit" className="bt-btn bt-btn--run" disabled={busy}>
            {busy ? 'Running…' : 'Run backtest'}
          </button>
        </div>
      </form>

      <section className="bt-history" aria-label="Recent runs">
        <h2>Recent runs</h2>
        {runs.length === 0 ? (
          <p className="bt-chips__empty">No runs yet. Click Run backtest.</p>
        ) : (
          <ul>
            {runs.map((r) => {
              const selected = active?.id === r.id
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`bt-runchip bt-runchip--${r.status || 'queued'}${selected ? ' is-selected' : ''}`}
                    aria-pressed={selected}
                    title={specRows(r.spec)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join('\n')}
                    onClick={async () => {
                      try {
                        await openRun(r.id)
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Load failed')
                      }
                    }}
                  >
                    <span>{r.status}</span>
                    <em>{specChipLabel(r.spec) || r.createdAt?.slice(0, 16) || r.id.slice(0, 8)}</em>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {active && (
        <section className="bt-metrics" aria-label="Run summary">
          <Metric
            label="Status"
            value={active.status}
            tone={
              active.status === 'done'
                ? 'good'
                : active.status === 'failed'
                  ? 'bad'
                  : 'info'
            }
          />
          <Metric
            label="Resolved WR"
            value={pct(summary.resolvedWr)}
            tone={wrTone(summary.resolvedWr)}
          />
          <Metric
            label="Trade WR"
            value={pct(summary.tradeWr)}
            tone={wrTone(summary.tradeWr)}
          />
          <Metric label="Trades" value={summary.trades ?? '—'} tone="info" />
          <Metric label="P&L" value={inr(runPnl)} tone={pnlTone} />
          <Metric
            label="Return"
            value={retPct(runPnlPct)}
            tone={pnlTone}
          />
          <Metric
            label="Avg R"
            value={num(summary.avgR)}
            tone={Number(summary.avgR) > 0 ? 'good' : Number(summary.avgR) < 0 ? 'bad' : 'warn'}
          />
          <Metric label="Max DD (R)" value={num(summary.maxDdR)} tone="warn" />
        </section>
      )}

      {usedRows.length > 0 && (
        <section className="bt-card" aria-label="Filters used for this run">
          <div className="bt-card__head">
            <span className="bt-dot" />
            Filters used
          </div>
          <dl className="bt-spec">
            {usedRows.map(([k, v]) => (
              <div key={k} className="bt-spec__row">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {active?.errorMessage && <p className="bt-error">{active.errorMessage}</p>}

      {active && trades.length === 0 && active.status === 'done' && (
        <p className="bt-chips__empty bt-trades-empty">No trades for this run.</p>
      )}

      {trades.length > 0 && (
        <div className="bt-table-wrap">
          <table className="bt-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Type</th>
                <th>Detect</th>
                <th>Entry</th>
                <th>Stop</th>
                <th>Target</th>
                <th>Exit</th>
                <th>P&L</th>
                <th>%</th>
                <th>R</th>
                <th>Flags</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 200).map((t) => {
                const r = Number(t.rMultiple)
                const win = Number.isFinite(r) && r > 0
                const loss = Number.isFinite(r) && r < 0
                const p = tradePnl(t)
                const pPct = tradePnlPct(t)
                const moneyWin = p != null && p > 0
                const moneyLoss = p != null && p < 0
                return (
                  <tr key={t.id}>
                    <td className="bt-td-sym">{t.tradingSymbol || t.symbolId}</td>
                    <td>{formatPatternTypeLabel(t.patternType)}</td>
                    <td className="bt-td-muted">{formatTs(t.detectTime)}</td>
                    <td>{num(t.fillEntry ?? t.entry)}</td>
                    <td>{num(t.stop)}</td>
                    <td>{num(t.target)}</td>
                    <td>
                      <span className={`bt-exit bt-exit--${t.outcome || 'none'}`}>
                        {t.outcome || '—'}
                      </span>
                    </td>
                    <td className={moneyWin ? 'bt-r-pos' : moneyLoss ? 'bt-r-neg' : ''}>{inr(p)}</td>
                    <td className={moneyWin ? 'bt-r-pos' : moneyLoss ? 'bt-r-neg' : ''}>
                      {retPct(pPct)}
                    </td>
                    <td className={win ? 'bt-r-pos' : loss ? 'bt-r-neg' : ''}>{num(t.rMultiple)}</td>
                    <td className="bt-td-flags">
                      {t.flagConfirmed ? <span className="bt-flag">confirmed</span> : null}
                      {t.flagRetested ? <span className="bt-flag">retest</span> : null}
                      {t.flagEntryReached ? (
                        <span
                          className="bt-flag"
                          title="After a retest, close back through the detect entry (same-bar reclaim only on a trade-direction candle)"
                        >
                          reclaim
                        </span>
                      ) : null}
                      {t.volumeOk ? <span className="bt-flag">vol</span> : null}
                      {!t.flagConfirmed && !t.flagRetested && !t.flagEntryReached && !t.volumeOk ? (
                        <span className="bt-td-muted">—</span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

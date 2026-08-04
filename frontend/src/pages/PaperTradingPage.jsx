import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PaperSkeleton from '../components/PaperSkeleton'
import { useToasts } from '../hooks/useToasts'
import {
  fetchPaperAccount,
  fetchPaperFills,
  fetchPaperOrders,
  fetchPaperPositions,
  parsePaperApiError,
  placePaperOrder,
} from '../services/paperApi'
import {
  computePaperPnl,
  computeWinRate,
  formatWinRatePct,
} from '../utils/paperPnl'
import './paperTrading.css'

function money(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function pnlClass(n) {
  if (n == null || Number.isNaN(n)) return ''
  if (n > 0) return 'pnl-pos'
  if (n < 0) return 'pnl-neg'
  return ''
}

function formatTime(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function newClientOrderId(prefix, extra = '') {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}${extra ? `${extra}-` : ''}${uuid}`.slice(0, 64)
}

export default function PaperTradingPage() {
  const { pushToast } = useToasts()
  const [account, setAccount] = useState(null)
  const [allLots, setAllLots] = useState([])
  const [orders, setOrders] = useState([])
  const [fills, setFills] = useState([])
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('open') // open | closed | fills
  const tablistId = useId()

  const refresh = useCallback(async (opts = {}) => {
    const force = Boolean(opts.force)
    if (!force && document.hidden) return
    try {
      const [acc, lots, ords, fl] = await Promise.all([
        fetchPaperAccount(),
        fetchPaperPositions(false),
        fetchPaperOrders(undefined, { limit: 500 }),
        fetchPaperFills({ limit: 500 }),
      ])
      setAccount(acc)
      setAllLots(Array.isArray(lots) ? lots : [])
      setOrders(Array.isArray(ords) ? ords : [])
      setFills(Array.isArray(fl) ? fl : [])
      setError(null)
    } catch (e) {
      const { code, message } = parsePaperApiError(e)
      setError(code ? `${code} — ${message}` : message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh({ force: true })
    // Automatic refresh only; close/actions still call refresh({ force: true }).
    const t = setInterval(() => refresh(), 30_000)
    return () => clearInterval(t)
  }, [refresh])

  const openPositions = useMemo(
    () => allLots.filter((p) => (p.status || '').toUpperCase() === 'OPEN'),
    [allLots],
  )

  const closedPositions = useMemo(
    () =>
      allLots
        .filter((p) => (p.status || '').toUpperCase() === 'CLOSED')
        .slice()
        .sort((a, b) => String(b.closedAt || '').localeCompare(String(a.closedAt || '')))
        .slice(0, 100),
    [allLots],
  )

  const recentFills = useMemo(
    () =>
      (fills || [])
        .slice()
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, 100),
    [fills],
  )

  const pnl = useMemo(
    () => computePaperPnl(allLots, { fills, orders }),
    [allLots, fills, orders],
  )

  const win = useMemo(() => computeWinRate(allLots), [allLots])

  const equity = useMemo(() => {
    const cash = Number(account?.cashBalance)
    const upnl = Number(pnl.overallUnrealized)
    if (Number.isNaN(cash)) return null
    const u = Number.isNaN(upnl) ? 0 : upnl
    return cash + u
  }, [account, pnl.overallUnrealized])

  async function onCloseLot(pos) {
    if (!pos?.id) return
    setBusyId(pos.id)
    setError(null)
    try {
      const order = await placePaperOrder({
        instrumentKey: pos.instrumentKey,
        side: pos.side === 'LONG' ? 'SELL' : 'BUY',
        orderType: 'MARKET',
        product: pos.product,
        qty: pos.qtyOpen,
        closeLotId: pos.id,
        clientOrderId: newClientOrderId('desk-close-', pos.id.slice(0, 8)),
      })
      const st = (order.status || '').toUpperCase()
      const filled = Number(order.filledQty) || 0
      pushToast({
        kind: 'success',
        message:
          st === 'FILLED' || filled > 0
            ? `Closed ${pos.tradingSymbol} ×${filled || pos.qtyOpen}`
            : `Close order accepted · ${pos.tradingSymbol}`,
      })
      await refresh({ force: true })
    } catch (err) {
      const { code, message } = parsePaperApiError(err)
      const text = code ? `${code} — ${message}` : message
      setError(text)
      pushToast({ kind: 'error', message: text })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="paper-page paper-page--in-shell">
      <header className="paper-desk-header">
        <div className="paper-desk-header__title-row">
          <div>
            <p className="paper-badge">PAPER</p>
            <h1 className="paper-desk-title">Positions</h1>
          </div>
          <div className="paper-desk-header__meta">
            <span className="paper-desk-cash" aria-label="Account balances">
              Equity <strong>₹{money(equity)}</strong>
              <span className="paper-desk-cash__sep">·</span>
              Free <strong>₹{money(account?.freeCash)}</strong>
              <span className="paper-desk-cash__sep">·</span>
              Cash <strong>₹{money(account?.cashBalance)}</strong>
              <span className="paper-desk-cash__sep">·</span>
              Locked <strong>₹{money(account?.lockedCash)}</strong>
            </span>
            <button
              type="button"
              className="paper-desk-refresh"
              onClick={() => refresh({ force: true })}
              title="Refresh"
              aria-label="Refresh positions"
            >
              ↻
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="paper-error" role="alert">
          {error}
        </div>
      )}

      <section className="paper-metrics" aria-label="Profit and loss">
        <div className="paper-metrics__card paper-metrics__card--day">
          <h2 className="paper-metrics__title">Today&apos;s P&amp;L</h2>
          <div className={`paper-metrics__primary ${pnlClass(pnl.dayTotal)}`}>
            ₹{money(pnl.dayTotal)}
          </div>
          <dl className="paper-metrics__sub">
            <div>
              <dt>Realized</dt>
              <dd className={pnlClass(pnl.dayRealized)}>₹{money(pnl.dayRealized)}</dd>
            </div>
            <div>
              <dt>Unrealized</dt>
              <dd className={pnlClass(pnl.dayUnrealized)}>₹{money(pnl.dayUnrealized)}</dd>
            </div>
          </dl>
        </div>

        <div className="paper-metrics__card paper-metrics__card--total">
          <h2 className="paper-metrics__title">Total P&amp;L</h2>
          <div className={`paper-metrics__primary ${pnlClass(pnl.overallTotal)}`}>
            ₹{money(pnl.overallTotal)}
          </div>
          <dl className="paper-metrics__sub">
            <div>
              <dt>Realized</dt>
              <dd className={pnlClass(pnl.overallRealized)}>
                ₹{money(pnl.overallRealized)}
              </dd>
            </div>
            <div>
              <dt>Unrealized</dt>
              <dd className={pnlClass(pnl.overallUnrealized)}>
                ₹{money(pnl.overallUnrealized)}
              </dd>
            </div>
          </dl>
        </div>

        <div
          className="paper-metrics__card paper-metrics__card--win"
          title={
            win.flats > 0
              ? `${win.flats} breakeven lot(s) excluded from win rate`
              : undefined
          }
        >
          <h2 className="paper-metrics__title">Win Rate</h2>
          <div className="paper-metrics__primary">{formatWinRatePct(win.winRate)}</div>
          <p className="paper-metrics__helper">
            Closed lots (n={win.wins + win.losses}
            {win.flats ? ` · ${win.flats} flat` : ''})
          </p>
          <p className="paper-metrics__wins">
            {win.wins} Wins / {win.losses} Losses
          </p>
        </div>
      </section>

      <section className="paper-panel" aria-labelledby="paper-pos-heading">
        <div className="paper-panel__head paper-panel__head--tabs">
          <h2 id="paper-pos-heading" className="visually-hidden">
            Positions desk
          </h2>
          <div className="paper-order-tabs" role="tablist" aria-label="Position lists">
            <button
              type="button"
              role="tab"
              id={`${tablistId}-open`}
              aria-selected={tab === 'open'}
              className={`paper-order-tabs__btn${tab === 'open' ? ' is-active' : ''}`}
              onClick={() => setTab('open')}
            >
              Open
              <span className="paper-order-tabs__count">{openPositions.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              id={`${tablistId}-closed`}
              aria-selected={tab === 'closed'}
              className={`paper-order-tabs__btn${tab === 'closed' ? ' is-active' : ''}`}
              onClick={() => setTab('closed')}
            >
              Closed
              <span className="paper-order-tabs__count">{closedPositions.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              id={`${tablistId}-fills`}
              aria-selected={tab === 'fills'}
              className={`paper-order-tabs__btn${tab === 'fills' ? ' is-active' : ''}`}
              onClick={() => setTab('fills')}
            >
              Fills
              <span className="paper-order-tabs__count">{recentFills.length}</span>
            </button>
          </div>
        </div>

        {loading ? (
          <PaperSkeleton rows={5} cols={7} label="Loading positions" />
        ) : tab === 'open' ? (
          openPositions.length === 0 ? (
            <div className="paper-empty-cta">
              <p className="paper-empty">No open lots</p>
              <p className="paper-empty-cta__hint">
                Open the chart, pick an equity (e.g. RELIANCE), then press <kbd>B</kbd> /{' '}
                <kbd>S</kbd> or Buy / Sell.
              </p>
              <Link to="/" className="paper-empty-cta__link">
                Open chart →
              </Link>
            </div>
          ) : (
            <div className="paper-table-wrap paper-table-wrap--positions">
              <table className="paper-table paper-table--desk">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Avg</th>
                    <th>LTP</th>
                    <th>P&amp;L</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {openPositions.map((p) => {
                    const u = p.unrealizedPnl
                    return (
                      <tr key={p.id}>
                        <td className="paper-td-symbol">{p.tradingSymbol}</td>
                        <td>
                          <span
                            className={
                              p.side === 'LONG'
                                ? 'paper-side paper-side--long'
                                : 'paper-side paper-side--short'
                            }
                          >
                            {p.side}
                          </span>
                        </td>
                        <td>
                          <span className="paper-chip">{p.product}</span>
                        </td>
                        <td>{p.qtyOpen}</td>
                        <td>₹{money(p.avgEntryPrice)}</td>
                        <td>₹{money(p.ltp)}</td>
                        <td className={pnlClass(u)}>₹{money(u)}</td>
                        <td>
                          <button
                            type="button"
                            className="paper-btn-close"
                            disabled={busyId === p.id}
                            onClick={() => onCloseLot(p)}
                          >
                            {busyId === p.id ? '…' : 'Close'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'closed' ? (
          closedPositions.length === 0 ? (
            <p className="paper-empty">No closed lots yet</p>
          ) : (
            <div className="paper-table-wrap">
              <table className="paper-table paper-table--desk">
                <thead>
                  <tr>
                    <th>Closed</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Avg</th>
                    <th>Realized</th>
                  </tr>
                </thead>
                <tbody>
                  {closedPositions.map((p) => (
                    <tr key={p.id}>
                      <td className="paper-td-muted">{formatTime(p.closedAt)}</td>
                      <td className="paper-td-symbol">{p.tradingSymbol}</td>
                      <td>
                        <span
                          className={
                            p.side === 'LONG'
                              ? 'paper-side paper-side--long'
                              : 'paper-side paper-side--short'
                          }
                        >
                          {p.side}
                        </span>
                      </td>
                      <td>
                        <span className="paper-chip">{p.product}</span>
                      </td>
                      <td>{p.qtyClosed ?? p.qtyOpen}</td>
                      <td>₹{money(p.avgEntryPrice)}</td>
                      <td className={pnlClass(p.realizedPnl)}>₹{money(p.realizedPnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : recentFills.length === 0 ? (
          <p className="paper-empty">No fills yet</p>
        ) : (
          <div className="paper-table-wrap">
            <table className="paper-table paper-table--desk">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentFills.map((f) => (
                  <tr key={f.id}>
                    <td className="paper-td-muted">{formatTime(f.createdAt)}</td>
                    <td className="paper-td-symbol">
                      {(f.instrumentKey || '').split('|').pop() || f.instrumentKey}
                    </td>
                    <td>
                      <span
                        className={`side-pill${
                          (f.side || '').toUpperCase() === 'BUY'
                            ? ' side-pill--buy'
                            : ' side-pill--sell'
                        }`}
                      >
                        {f.side}
                      </span>
                    </td>
                    <td>{f.qty}</td>
                    <td>₹{money(f.price)}</td>
                    <td>₹{money(f.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

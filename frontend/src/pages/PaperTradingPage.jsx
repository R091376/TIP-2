import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/useAuth'
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

function newClientOrderId(prefix, extra = '') {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}${extra ? `${extra}-` : ''}${uuid}`.slice(0, 64)
}

export default function PaperTradingPage() {
  const { user } = useAuth()
  const [account, setAccount] = useState(null)
  const [allLots, setAllLots] = useState([])
  const [orders, setOrders] = useState([])
  const [fills, setFills] = useState([])
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

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
    }
  }, [])

  useEffect(() => {
    refresh({ force: true })
    const t = setInterval(() => refresh(), 3000)
    return () => clearInterval(t)
  }, [refresh])

  const openPositions = useMemo(
    () => allLots.filter((p) => (p.status || '').toUpperCase() === 'OPEN'),
    [allLots],
  )

  const pnl = useMemo(
    () => computePaperPnl(allLots, { fills, orders }),
    [allLots, fills, orders],
  )

  const win = useMemo(() => computeWinRate(allLots), [allLots])

  async function onCloseLot(pos) {
    if (!pos?.id) return
    setBusyId(pos.id)
    setError(null)
    try {
      await placePaperOrder({
        instrumentKey: pos.instrumentKey,
        side: pos.side === 'LONG' ? 'SELL' : 'BUY',
        orderType: 'MARKET',
        product: pos.product,
        qty: pos.qtyOpen,
        closeLotId: pos.id,
        clientOrderId: newClientOrderId('desk-close-', pos.id.slice(0, 8)),
      })
      await refresh({ force: true })
    } catch (err) {
      const { code, message } = parsePaperApiError(err)
      setError(code ? `${code} — ${message}` : message)
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
              Free <strong>₹{money(account?.freeCash)}</strong>
              <span className="paper-desk-cash__sep">·</span>
              Cash <strong>₹{money(account?.cashBalance)}</strong>
              <span className="paper-desk-cash__sep">·</span>
              Locked <strong>₹{money(account?.lockedCash)}</strong>
            </span>
            <span className="paper-desk-user-chip" title={user?.username || ''}>
              {user?.displayName || user?.username || '—'}
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
          <p className="paper-metrics__helper">Closed lots (all time)</p>
          <p className="paper-metrics__wins">
            {win.wins} Wins / {win.losses} Losses
          </p>
        </div>
      </section>

      <section
        className="paper-panel"
        aria-labelledby="paper-pos-heading"
      >
        <div className="paper-panel__head">
          <h2 id="paper-pos-heading">Open positions</h2>
          <span className="paper-panel__count">{openPositions.length}</span>
        </div>

        {openPositions.length === 0 ? (
          <p className="paper-empty">No open lots</p>
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
        )}
      </section>
    </div>
  )
}

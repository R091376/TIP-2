import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import PaperPageChrome from '../components/PaperPageChrome'
import {
  cancelPaperOrder,
  fetchPaperFills,
  fetchPaperOrders,
  fetchPaperPositions,
  parsePaperApiError,
} from '../services/paperApi'
import { buildOrderPnlMap } from '../utils/paperOrderPnl'
import './paperTrading.css'

const OPEN_ORDER = new Set(['OPEN', 'TRIGGER_PENDING', 'PARTIALLY_FILLED'])
const CLOSED_ORDER = new Set(['FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED'])

function money(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
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

function statusClass(status) {
  const s = (status || '').toUpperCase()
  if (s === 'FILLED' || s === 'PARTIALLY_FILLED') return 'paper-status--filled'
  if (s === 'CANCELLED' || s === 'EXPIRED') return 'paper-status--cancel'
  if (s === 'REJECTED') return 'paper-status--reject'
  if (s === 'OPEN' || s === 'TRIGGER_PENDING') return 'paper-status--open'
  return ''
}

function pnlClass(n) {
  if (n == null || Number.isNaN(n)) return ''
  if (n > 0) return 'pnl-pos'
  if (n < 0) return 'pnl-neg'
  return ''
}

/** Cell for per-order P&L */
function OrderPnlCell({ result }) {
  if (!result || result.kind === 'none' || result.value == null) {
    return <span className="paper-td-muted">—</span>
  }
  const label = result.kind === 'realized' ? 'R' : 'U'
  const title =
    result.kind === 'realized'
      ? 'Realized P&L on this order (close/cover)'
      : 'Unrealized P&L on filled qty vs LTP (open position)'
  return (
    <span className={`paper-order-pnl ${pnlClass(result.value)}`} title={title}>
      <span className="paper-order-pnl__kind" aria-hidden="true">
        {label}
      </span>
      ₹{money(result.value)}
    </span>
  )
}

export default function PaperOrdersPage() {
  const { user, isAdmin, logout } = useAuth()
  const [orders, setOrders] = useState([])
  const [fills, setFills] = useState([])
  const [lots, setLots] = useState([])
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [tab, setTab] = useState('open') // open | closed

  const refresh = useCallback(async (opts = {}) => {
    const force = Boolean(opts.force)
    if (!force && document.hidden) return
    try {
      const [ords, fl, allLots] = await Promise.all([
        fetchPaperOrders(undefined, { limit: 500 }),
        fetchPaperFills({ limit: 500 }),
        fetchPaperPositions(false),
      ])
      setOrders(Array.isArray(ords) ? ords : [])
      setFills(Array.isArray(fl) ? fl : [])
      setLots(Array.isArray(allLots) ? allLots : [])
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

  const pnlByOrderId = useMemo(
    () => buildOrderPnlMap(orders, fills, lots),
    [orders, fills, lots],
  )

  const openOrders = useMemo(
    () => orders.filter((o) => OPEN_ORDER.has((o.status || '').toUpperCase())),
    [orders],
  )

  const closedOrders = useMemo(
    () =>
      orders
        .filter((o) => CLOSED_ORDER.has((o.status || '').toUpperCase()))
        .slice(0, 100),
    [orders],
  )

  async function onCancel(id) {
    setBusyId(id)
    setError(null)
    try {
      await cancelPaperOrder(id)
      await refresh({ force: true })
    } catch (err) {
      const { code, message } = parsePaperApiError(err)
      setError(code ? `${code} — ${message}` : message)
    } finally {
      setBusyId(null)
    }
  }

  const hitOrderCap = orders.length >= 500
  const hitFillCap = fills.length >= 500

  return (
    <div className="paper-page">
      <PaperPageChrome
        user={user}
        isAdmin={isAdmin}
        onLogout={() => logout?.()}
        title="Paper orders"
        subtitle="Working and closed paper orders · place new trades from the chart"
      />

      {error && (
        <div className="paper-error" role="alert">
          {error}
        </div>
      )}

      <p className="paper-desk-hint">
        <Link to="/paper">← Positions &amp; P&amp;L</Link>
        {' · '}
        <strong>U</strong> = unrealized vs LTP on open entries · <strong>R</strong> = realized
        on close/cover · “—” when not filled, fills incomplete, or entry closed via another
        order
        {hitOrderCap || hitFillCap
          ? ' · Showing latest 500 orders/fills; older rows may omit P&L'
          : null}
      </p>

      <div className="paper-order-tabs" role="tablist" aria-label="Order lists">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'open'}
          className={`paper-order-tabs__btn${tab === 'open' ? ' is-active' : ''}`}
          onClick={() => setTab('open')}
        >
          Open
          <span className="paper-order-tabs__count">{openOrders.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'closed'}
          className={`paper-order-tabs__btn${tab === 'closed' ? ' is-active' : ''}`}
          onClick={() => setTab('closed')}
        >
          Closed
          <span className="paper-order-tabs__count">{closedOrders.length}</span>
        </button>
      </div>

      <div className="paper-desk">
        {tab === 'open' ? (
          <section
            className="paper-section paper-section--open-orders"
            aria-labelledby="paper-oo-heading"
          >
            <div className="paper-section__head">
              <h2 id="paper-oo-heading">Open orders</h2>
              <span className="paper-section__count">{openOrders.length}</span>
            </div>
            {openOrders.length === 0 ? (
              <p className="paper-empty">No working orders</p>
            ) : (
              <div className="paper-table-wrap paper-table-wrap--open">
                <table className="paper-table paper-table--open">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Type</th>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Price / trig</th>
                      <th>P&amp;L</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {openOrders.map((o) => (
                      <tr key={o.id}>
                        <td className="paper-td-muted">{formatTime(o.createdAt)}</td>
                        <td className="paper-td-symbol">{o.tradingSymbol}</td>
                        <td>
                          <span
                            className={
                              o.side === 'BUY'
                                ? 'paper-side paper-side--long'
                                : 'paper-side paper-side--short'
                            }
                          >
                            {o.side}
                          </span>
                        </td>
                        <td>{o.orderType}</td>
                        <td>{o.product}</td>
                        <td>
                          {o.filledQty > 0 ? `${o.filledQty}/${o.qty}` : o.qty}
                        </td>
                        <td className="paper-td-muted">
                          {o.price != null ? `₹${money(o.price)}` : '—'}
                          {o.triggerPrice != null ? (
                            <>
                              <br />
                              <span>trig ₹{money(o.triggerPrice)}</span>
                            </>
                          ) : null}
                        </td>
                        <td>
                          <OrderPnlCell result={pnlByOrderId.get(o.id)} />
                        </td>
                        <td>
                          <span className={`paper-status ${statusClass(o.status)}`}>
                            {o.status}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="paper-mini paper-mini--danger"
                            disabled={busyId === o.id}
                            onClick={() => onCancel(o.id)}
                          >
                            {busyId === o.id ? '…' : 'Cancel'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
          <section
            className="paper-section paper-section--history"
            aria-labelledby="paper-co-heading"
          >
            <div className="paper-section__head">
              <h2 id="paper-co-heading">Closed orders</h2>
              <span className="paper-section__count">{closedOrders.length}</span>
            </div>
            {closedOrders.length === 0 ? (
              <p className="paper-empty">No closed orders yet</p>
            ) : (
              <div className="paper-table-wrap paper-table-wrap--history paper-table-wrap--history-tall">
                <table className="paper-table paper-table--history">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Type</th>
                      <th>Fill</th>
                      <th>P&amp;L</th>
                      <th>Status</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedOrders.map((o) => (
                      <tr key={o.id}>
                        <td className="paper-td-muted">{formatTime(o.createdAt)}</td>
                        <td className="paper-td-symbol">{o.tradingSymbol}</td>
                        <td>{o.side}</td>
                        <td>
                          {o.orderType}
                          {o.product ? (
                            <span className="paper-td-sub"> · {o.product}</span>
                          ) : null}
                        </td>
                        <td>
                          {o.filledQty}/{o.qty}
                          {o.price != null ? (
                            <span className="paper-td-sub"> @ ₹{money(o.price)}</span>
                          ) : null}
                        </td>
                        <td>
                          <OrderPnlCell result={pnlByOrderId.get(o.id)} />
                        </td>
                        <td>
                          <span className={`paper-status ${statusClass(o.status)}`}>
                            {o.status}
                          </span>
                        </td>
                        <td className="paper-td-reason">{o.rejectReason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

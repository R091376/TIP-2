import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PaperSkeleton from '../components/PaperSkeleton'
import { useToasts } from '../hooks/useToasts'
import {
  cancelPaperOrder,
  fetchPaperFills,
  fetchPaperOrders,
  fetchPaperPositions,
  modifyPaperOrder,
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

function residualQty(o) {
  const qty = Number(o.qty) || 0
  const filled = Number(o.filledQty) || 0
  return Math.max(0, qty - filled)
}

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

function SidePill({ side }) {
  const s = (side || '').toUpperCase()
  const isBuy = s === 'BUY'
  return (
    <span className={`side-pill${isBuy ? ' side-pill--buy' : ' side-pill--sell'}`}>
      {isBuy ? 'Buy' : s === 'SELL' ? 'Sell' : side || '—'}
    </span>
  )
}

function filterOrders(list, { symbol, side, status }) {
  return list.filter((o) => {
    if (symbol) {
      const sym = (o.tradingSymbol || '').toLowerCase()
      if (!sym.includes(symbol.toLowerCase())) return false
    }
    if (side && side !== 'all') {
      if ((o.side || '').toUpperCase() !== side.toUpperCase()) return false
    }
    if (status && status !== 'all') {
      if ((o.status || '').toUpperCase() !== status.toUpperCase()) return false
    }
    return true
  })
}

function canModifyOrder(o) {
  const st = (o?.status || '').toUpperCase()
  if (!OPEN_ORDER.has(st)) return false
  const ot = (o?.orderType || '').toUpperCase()
  // MARKET residual rarely modifiable in practice; allow LIMIT / SL / SL_M
  return ot === 'LIMIT' || ot === 'SL' || ot === 'SL_M' || ot === 'MARKET'
}

export default function PaperOrdersPage() {
  const { pushToast } = useToasts()
  const [orders, setOrders] = useState([])
  const [fills, setFills] = useState([])
  const [lots, setLots] = useState([])
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('open') // open | closed
  const [symbolFilter, setSymbolFilter] = useState('')
  const [sideFilter, setSideFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  /** @type {null | { id: string, orderType: string, qty: string, price: string, triggerPrice: string, filledQty: number }} */
  const [modifyDraft, setModifyDraft] = useState(null)
  const tablistId = useId()
  const openPanelId = `${tablistId}-open`
  const closedPanelId = `${tablistId}-closed`

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
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh({ force: true })
    const t = setInterval(() => refresh(), 3000)
    return () => clearInterval(t)
  }, [refresh])

  // Reset status filter when switching tabs (different status sets)
  useEffect(() => {
    setStatusFilter('all')
  }, [tab])

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

  const filters = {
    symbol: symbolFilter.trim(),
    side: sideFilter,
    status: statusFilter,
  }

  const filteredOpen = useMemo(
    () => filterOrders(openOrders, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters object rebuilt each render
    [openOrders, symbolFilter, sideFilter, statusFilter],
  )

  const filteredClosed = useMemo(
    () => filterOrders(closedOrders, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closedOrders, symbolFilter, sideFilter, statusFilter],
  )

  async function onCancel(id) {
    setBusyId(id)
    setError(null)
    try {
      await cancelPaperOrder(id)
      pushToast({ kind: 'info', message: 'Order cancelled' })
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

  function openModify(o) {
    setModifyDraft({
      id: o.id,
      orderType: (o.orderType || '').toUpperCase(),
      qty: String(o.qty ?? ''),
      price: o.price != null ? String(o.price) : '',
      triggerPrice: o.triggerPrice != null ? String(o.triggerPrice) : '',
      filledQty: Number(o.filledQty) || 0,
      symbol: o.tradingSymbol || '',
    })
  }

  async function submitModify(e) {
    e.preventDefault()
    if (!modifyDraft?.id) return
    const body = {}
    const qty = Number(modifyDraft.qty)
    if (Number.isInteger(qty) && qty >= 1) body.qty = qty
    const ot = modifyDraft.orderType
    if ((ot === 'LIMIT' || ot === 'SL') && modifyDraft.price !== '') {
      body.price = Number(modifyDraft.price)
    }
    if ((ot === 'SL' || ot === 'SL_M') && modifyDraft.triggerPrice !== '') {
      body.triggerPrice = Number(modifyDraft.triggerPrice)
    }
    setBusyId(modifyDraft.id)
    setError(null)
    try {
      await modifyPaperOrder(modifyDraft.id, body)
      pushToast({
        kind: 'success',
        message: `Order modified · ${modifyDraft.symbol || 'order'}`,
      })
      setModifyDraft(null)
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
            <h1 className="paper-desk-title">Orders</h1>
          </div>
          <div className="paper-desk-header__meta">
            <button
              type="button"
              className="paper-desk-refresh"
              onClick={() => refresh({ force: true })}
              title="Refresh"
              aria-label="Refresh orders"
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

      <div className="paper-panel paper-panel--orders">
        <div className="paper-order-tabs" role="tablist" aria-label="Order lists">
          <button
            type="button"
            role="tab"
            id={`${tablistId}-tab-open`}
            aria-selected={tab === 'open'}
            aria-controls={openPanelId}
            className={`paper-order-tabs__btn${tab === 'open' ? ' is-active' : ''}`}
            onClick={() => setTab('open')}
          >
            Open Orders
            <span className="paper-order-tabs__count">{openOrders.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            id={`${tablistId}-tab-closed`}
            aria-selected={tab === 'closed'}
            aria-controls={closedPanelId}
            className={`paper-order-tabs__btn${tab === 'closed' ? ' is-active' : ''}`}
            onClick={() => setTab('closed')}
          >
            Order History
            <span className="paper-order-tabs__count">{closedOrders.length}</span>
          </button>
        </div>

        <div className="paper-order-filters" role="search" aria-label="Filter orders">
          <label className="paper-order-filters__field">
            <span className="visually-hidden">Symbol</span>
            <input
              type="search"
              placeholder="Symbol"
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
              className="paper-order-filters__input"
            />
          </label>
          <label className="paper-order-filters__field">
            <span className="visually-hidden">Side</span>
            <select
              value={sideFilter}
              onChange={(e) => setSideFilter(e.target.value)}
              className="paper-order-filters__select"
            >
              <option value="all">Buy / Sell</option>
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </label>
          <label className="paper-order-filters__field">
            <span className="visually-hidden">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="paper-order-filters__select"
            >
              <option value="all">Status</option>
              {tab === 'open' ? (
                <>
                  <option value="OPEN">Open</option>
                  <option value="TRIGGER_PENDING">Trigger pending</option>
                  <option value="PARTIALLY_FILLED">Partially filled</option>
                </>
              ) : (
                <>
                  <option value="FILLED">Filled</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="EXPIRED">Expired</option>
                </>
              )}
            </select>
          </label>
        </div>

        {loading ? (
          <PaperSkeleton rows={5} cols={8} label="Loading orders" />
        ) : tab === 'open' ? (
          <div
            role="tabpanel"
            id={openPanelId}
            aria-labelledby={`${tablistId}-tab-open`}
          >
            {filteredOpen.length === 0 ? (
              <div className="paper-empty-cta">
                <p className="paper-empty">No working orders</p>
                <p className="paper-empty-cta__hint">
                  Place a LIMIT or SL from the chart after selecting an equity.
                </p>
                <Link to="/" className="paper-empty-cta__link">
                  Open chart →
                </Link>
              </div>
            ) : (
              <div className="paper-table-wrap paper-table-wrap--open">
                <table className="paper-table paper-table--desk">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Symbol</th>
                      <th>Type</th>
                      <th className="paper-th-product">Product</th>
                      <th>Quantity</th>
                      <th>Price</th>
                      <th title="Unfilled quantity">Pending qty</th>
                      <th>P&amp;L</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOpen.map((o) => {
                      const residual = residualQty(o)
                      const partial =
                        (o.status || '').toUpperCase() === 'PARTIALLY_FILLED' ||
                        (Number(o.filledQty) > 0 &&
                          Number(o.filledQty) < Number(o.qty))
                      return (
                        <tr key={o.id}>
                          <td className="paper-td-muted">{formatTime(o.createdAt)}</td>
                          <td className="paper-td-symbol">{o.tradingSymbol}</td>
                          <td>
                            <div className="paper-type-cell">
                              <SidePill side={o.side} />
                              <span className="paper-td-sub">{o.orderType}</span>
                            </div>
                          </td>
                          <td className="paper-td-product">{o.product}</td>
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
                            <div className="paper-working-cell">
                              <span>{residual}</span>
                              {partial ? (
                                <span className="paper-status paper-status--filled">
                                  Partially Filled
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <OrderPnlCell result={pnlByOrderId.get(o.id)} />
                          </td>
                          <td>
                            <div className="paper-row-actions">
                              {canModifyOrder(o) ? (
                                <button
                                  type="button"
                                  className="paper-mini"
                                  disabled={busyId === o.id}
                                  onClick={() => openModify(o)}
                                >
                                  Modify
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="paper-mini paper-mini--danger"
                                disabled={busyId === o.id}
                                onClick={() => onCancel(o.id)}
                              >
                                {busyId === o.id ? '…' : 'Cancel'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div
            role="tabpanel"
            id={closedPanelId}
            aria-labelledby={`${tablistId}-tab-closed`}
          >
            {filteredClosed.length === 0 ? (
              <p className="paper-empty">No closed orders yet</p>
            ) : (
              <div className="paper-table-wrap paper-table-wrap--history paper-table-wrap--history-tall">
                <table className="paper-table paper-table--desk paper-table--history">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Symbol</th>
                      <th>Type</th>
                      <th>Quantity</th>
                      <th>Price</th>
                      <th>P&amp;L</th>
                      <th>Status</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClosed.map((o) => (
                      <tr key={o.id}>
                        <td className="paper-td-muted">{formatTime(o.createdAt)}</td>
                        <td className="paper-td-symbol">{o.tradingSymbol}</td>
                        <td>
                          <div className="paper-type-cell">
                            <SidePill side={o.side} />
                            <span className="paper-td-sub">
                              {o.orderType}
                              {o.product ? ` · ${o.product}` : ''}
                            </span>
                          </div>
                        </td>
                        <td>
                          {o.filledQty}/{o.qty}
                        </td>
                        <td className="paper-td-muted">
                          {o.price != null ? `₹${money(o.price)}` : '—'}
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
          </div>
        )}
      </div>

      {modifyDraft ? (
        <div
          className="paper-modify-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && busyId !== modifyDraft.id) {
              setModifyDraft(null)
            }
          }}
        >
          <form
            className="paper-modify-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Modify order"
            onSubmit={submitModify}
          >
            <header className="paper-modify-dialog__head">
              <h2>Modify {modifyDraft.symbol || 'order'}</h2>
              <button
                type="button"
                className="paper-modify-dialog__close"
                aria-label="Close"
                disabled={busyId === modifyDraft.id}
                onClick={() => setModifyDraft(null)}
              >
                ×
              </button>
            </header>
            <p className="paper-modify-dialog__meta">
              {modifyDraft.orderType}
              {modifyDraft.filledQty > 0
                ? ` · filled ${modifyDraft.filledQty}`
                : ''}
            </p>
            <label className="paper-modify-dialog__field">
              Quantity
              <input
                type="number"
                min={Math.max(1, modifyDraft.filledQty)}
                step={1}
                value={modifyDraft.qty}
                onChange={(e) =>
                  setModifyDraft((d) => (d ? { ...d, qty: e.target.value } : d))
                }
                disabled={busyId === modifyDraft.id}
              />
            </label>
            {(modifyDraft.orderType === 'LIMIT' || modifyDraft.orderType === 'SL') && (
              <label className="paper-modify-dialog__field">
                Price
                <input
                  type="number"
                  min={0}
                  step="0.05"
                  value={modifyDraft.price}
                  onChange={(e) =>
                    setModifyDraft((d) =>
                      d ? { ...d, price: e.target.value } : d,
                    )
                  }
                  disabled={busyId === modifyDraft.id}
                />
              </label>
            )}
            {(modifyDraft.orderType === 'SL' || modifyDraft.orderType === 'SL_M') && (
              <label className="paper-modify-dialog__field">
                Trigger
                <input
                  type="number"
                  min={0}
                  step="0.05"
                  value={modifyDraft.triggerPrice}
                  onChange={(e) =>
                    setModifyDraft((d) =>
                      d ? { ...d, triggerPrice: e.target.value } : d,
                    )
                  }
                  disabled={busyId === modifyDraft.id}
                />
              </label>
            )}
            <div className="paper-modify-dialog__actions">
              <button
                type="button"
                className="paper-mini"
                disabled={busyId === modifyDraft.id}
                onClick={() => setModifyDraft(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="paper-mini paper-mini--primary"
                disabled={busyId === modifyDraft.id}
              >
                {busyId === modifyDraft.id ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

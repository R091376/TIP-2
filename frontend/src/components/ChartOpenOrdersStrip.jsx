import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  cancelPaperOrder,
  fetchPaperOrders,
  parsePaperApiError,
} from '../services/paperApi'
import { OPEN_ORDER_STATUSES } from '../utils/paperOrderConstants'

/** Poll interval while tab is visible (2–3s range). */
const POLL_MS = 2500

const OPEN_STATUS_SET = new Set(OPEN_ORDER_STATUSES)

/**
 * @param {string | undefined | null} status
 * @returns {boolean}
 */
export function isOpenOrderStatus(status) {
  return OPEN_STATUS_SET.has(status)
}

/**
 * Filter to open statuses for the active chart symbol.
 * @param {import('../services/paperApi').PaperOrder[] | null | undefined} orders
 * @param {string | null | undefined} instrumentKey
 */
export function filterOpenOrdersForSymbol(orders, instrumentKey) {
  if (!instrumentKey) return []
  const list = Array.isArray(orders) ? orders : []
  return list.filter(
    (o) => o.instrumentKey === instrumentKey && isOpenOrderStatus(o.status),
  )
}

/**
 * Prepend optimistic placed order when it matches symbol + open status and is not already listed.
 * @param {import('../services/paperApi').PaperOrder[]} rows
 * @param {import('../services/paperApi').PaperOrder | null | undefined} optimisticOrder
 * @param {string | null | undefined} instrumentKey
 */
export function mergeOptimisticOrder(rows, optimisticOrder, instrumentKey) {
  if (!optimisticOrder || !instrumentKey) return rows
  if (optimisticOrder.instrumentKey !== instrumentKey) return rows
  if (!isOpenOrderStatus(optimisticOrder.status)) return rows
  if (rows.some((r) => r.id === optimisticOrder.id)) return rows
  return [optimisticOrder, ...rows]
}

/** Compact qty + price/trigger line for a row. */
function formatOrderDetail(order) {
  const qty =
    order.filledQty > 0 && order.filledQty < order.qty
      ? `${order.filledQty}/${order.qty}`
      : String(order.qty ?? '')
  const ot = (order.orderType || '').toUpperCase()
  if (ot === 'MARKET') return qty
  if (ot === 'SL_M') {
    const trig = order.triggerPrice != null ? order.triggerPrice : '—'
    return `${qty}  trig ${trig}`
  }
  if (ot === 'SL') {
    const px = order.price != null ? order.price : '—'
    const trig = order.triggerPrice != null ? order.triggerPrice : '—'
    return `${qty}@${px}  trig ${trig}`
  }
  // LIMIT and others
  const px = order.price != null ? order.price : '—'
  return `${qty}@${px}`
}

/**
 * Mini open-orders strip under the chart.
 * Always keep mounted when feature on — return null for chrome when no rows so poll/refreshNonce still run.
 */
export default function ChartOpenOrdersStrip({
  instrumentKey,
  tradingSymbol,
  refreshNonce = 0,
  optimisticOrder = null,
  onCancelDone,
  onToast,
}) {
  const [orders, setOrders] = useState([])
  /** Ids cancelled locally so optimistic row does not reappear before parent clears. */
  const [cancelledIds, setCancelledIds] = useState(() => new Set())
  const [cancellingId, setCancellingId] = useState(null)

  const load = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return
    }
    try {
      const all = await fetchPaperOrders()
      setOrders(Array.isArray(all) ? all : [])
    } catch {
      /* silent poll / refresh failures */
    }
  }, [])

  // Immediate fetch on mount, symbol change, and parent refreshNonce (place / cancel).
  useEffect(() => {
    load()
  }, [load, refreshNonce, instrumentKey])

  // Visibility-aware 2.5s poll — keep running even when UI is null (empty).
  useEffect(() => {
    const tick = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') {
        return
      }
      load()
    }
    const id = setInterval(tick, POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load])

  // Drop cancelled-id bookkeeping when server no longer lists them (or symbol changes).
  useEffect(() => {
    setCancelledIds((prev) => {
      if (!prev.size) return prev
      const next = new Set()
      for (const id of prev) {
        if (orders.some((o) => o.id === id && isOpenOrderStatus(o.status))) {
          next.add(id)
        }
      }
      return next.size === prev.size ? prev : next
    })
  }, [orders, instrumentKey])

  const filtered = useMemo(
    () => filterOpenOrdersForSymbol(orders, instrumentKey),
    [orders, instrumentKey],
  )

  const effectiveOptimistic = useMemo(() => {
    if (!optimisticOrder) return null
    if (cancelledIds.has(optimisticOrder.id)) return null
    return optimisticOrder
  }, [optimisticOrder, cancelledIds])

  const rows = useMemo(
    () => mergeOptimisticOrder(filtered, effectiveOptimistic, instrumentKey),
    [filtered, effectiveOptimistic, instrumentKey],
  )

  async function handleCancel(id) {
    if (cancellingId) return
    setCancellingId(id)
    try {
      await cancelPaperOrder(id)
      setOrders((prev) => prev.filter((o) => o.id !== id))
      setCancelledIds((prev) => {
        const next = new Set(prev)
        next.add(id)
        return next
      })
      onToast?.({ kind: 'success', message: 'Order cancelled' })
      onCancelDone?.()
    } catch (err) {
      const { code, message } = parsePaperApiError(err)
      onToast?.({
        kind: 'error',
        message: code ? `${code} — ${message}` : message,
      })
    } finally {
      setCancellingId(null)
    }
  }

  // Hooks always run; no visible chrome when empty for active symbol.
  if (!rows.length) return null

  const label = tradingSymbol || instrumentKey || '…'

  return (
    <div className="chart-open-orders-strip" role="region" aria-label="Open paper orders">
      <div className="chart-open-orders-strip__header">
        <span className="chart-open-orders-strip__title">
          Open paper orders ({label}) · {rows.length}
        </span>
        <Link to="/paper" className="chart-open-orders-strip__desk-link">
          Paper desk
        </Link>
      </div>
      <ul className="chart-open-orders-strip__list">
        {rows.map((o) => {
          const side = (o.side || '').toUpperCase()
          const sideClass =
            side === 'BUY'
              ? 'chart-open-orders-strip__side--buy'
              : side === 'SELL'
                ? 'chart-open-orders-strip__side--sell'
                : ''
          const busy = cancellingId === o.id
          return (
            <li key={o.id} className="chart-open-orders-strip__row">
              <span className="chart-open-orders-strip__fields">
                <span className={`chart-open-orders-strip__side ${sideClass}`}>{side}</span>
                <span className="chart-open-orders-strip__type">{o.orderType}</span>
                <span className="chart-open-orders-strip__product">{o.product}</span>
                <span className="chart-open-orders-strip__detail">{formatOrderDetail(o)}</span>
                <span className="chart-open-orders-strip__status">{o.status}</span>
              </span>
              <button
                type="button"
                className="chart-open-orders-strip__cancel"
                disabled={!!cancellingId}
                aria-busy={busy || undefined}
                onClick={() => handleCancel(o.id)}
              >
                {busy ? '…' : 'Cancel'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

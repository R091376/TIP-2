import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  cancelPaperOrder,
  fetchPaperOrders,
  parsePaperApiError,
} from '../services/paperApi'
import { OPEN_ORDER_STATUSES } from '../utils/paperOrderConstants'

/** Poll interval while tab is visible (2–3s range). */
const POLL_MS = 2500

/**
 * Raise list cap toward API max so open working orders are less likely to fall
 * off the newest-first page. API status filter is single-value only (no multi-open).
 */
const FETCH_LIMIT = 500

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
 * Drop rows the user has already cancelled locally (until server catches up).
 * @param {import('../services/paperApi').PaperOrder[]} rows
 * @param {Set<string> | Iterable<string> | null | undefined} cancelledIds
 */
export function applyCancelledFilter(rows, cancelledIds) {
  if (!cancelledIds) return rows
  const set =
    cancelledIds instanceof Set ? cancelledIds : new Set(cancelledIds)
  if (!set.size) return rows
  return rows.filter((o) => !set.has(o.id))
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

/**
 * Retire optimistic once the server list includes that id (any status).
 * Open → server owns the row (merge would de-dupe). Terminal → must not re-ghost.
 * @param {import('../services/paperApi').PaperOrder | null | undefined} optimistic
 * @param {import('../services/paperApi').PaperOrder[] | null | undefined} serverOrders raw fetch
 */
export function shouldClearOptimisticAfterFetch(optimistic, serverOrders) {
  if (!optimistic?.id) return false
  const list = Array.isArray(serverOrders) ? serverOrders : []
  return list.some((o) => o.id === optimistic.id)
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
  onOptimisticClear,
  onToast,
}) {
  const [orders, setOrders] = useState([])
  /** Local optimistic seed; cleared when server absorbs id or matching cancel. */
  const [localOptimistic, setLocalOptimistic] = useState(null)
  /** Ids cancelled locally — suppress display until server no longer lists them open. */
  const [cancelledIds, setCancelledIds] = useState(() => new Set())
  const [cancellingId, setCancellingId] = useState(null)

  const loadSeqRef = useRef(0)
  const onOptimisticClearRef = useRef(onOptimisticClear)
  onOptimisticClearRef.current = onOptimisticClear

  // Seed / refresh local optimistic when parent passes a new placed order.
  useEffect(() => {
    if (!optimisticOrder) {
      setLocalOptimistic(null)
      return
    }
    setLocalOptimistic(optimisticOrder)
    setCancelledIds((prev) => {
      if (!prev.has(optimisticOrder.id)) return prev
      const next = new Set(prev)
      next.delete(optimisticOrder.id)
      return next
    })
  }, [optimisticOrder])

  const load = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return
    }
    const my = ++loadSeqRef.current
    try {
      // limit raised toward API max; multi-open status filter not available on API
      const all = await fetchPaperOrders(undefined, { limit: FETCH_LIMIT })
      if (my !== loadSeqRef.current) return
      const list = Array.isArray(all) ? all : []
      setOrders(list)

      setLocalOptimistic((prev) => {
        if (!shouldClearOptimisticAfterFetch(prev, list)) return prev
        onOptimisticClearRef.current?.(prev.id)
        return null
      })

      setCancelledIds((prev) => {
        if (!prev.size) return prev
        const next = new Set()
        for (const id of prev) {
          if (list.some((o) => o.id === id && isOpenOrderStatus(o.status))) {
            next.add(id)
          }
        }
        return next.size === prev.size ? prev : next
      })
    } catch {
      /* silent poll / refresh failures; still discard if superseded */
      if (my !== loadSeqRef.current) return
    }
  }, [])

  // Immediate fetch on mount, symbol change, and parent refreshNonce (place / cancel).
  useEffect(() => {
    load()
  }, [load, refreshNonce, instrumentKey])

  // Visibility-aware poll: only schedule interval while tab is visible.
  useEffect(() => {
    let intervalId = null

    const start = () => {
      if (intervalId != null) return
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') load()
      }, POLL_MS)
    }
    const stop = () => {
      if (intervalId == null) return
      clearInterval(intervalId)
      intervalId = null
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        load()
        start()
      } else {
        stop()
      }
    }

    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      start()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [load])

  const filtered = useMemo(() => {
    const open = filterOpenOrdersForSymbol(orders, instrumentKey)
    return applyCancelledFilter(open, cancelledIds)
  }, [orders, instrumentKey, cancelledIds])

  const effectiveOptimistic = useMemo(() => {
    if (!localOptimistic) return null
    if (cancelledIds.has(localOptimistic.id)) return null
    return localOptimistic
  }, [localOptimistic, cancelledIds])

  const rows = useMemo(
    () => mergeOptimisticOrder(filtered, effectiveOptimistic, instrumentKey),
    [filtered, effectiveOptimistic, instrumentKey],
  )

  async function handleCancel(id) {
    if (cancellingId) return
    setCancellingId(id)
    try {
      await cancelPaperOrder(id)
      // Bump seq so any in-flight poll cannot reinsert this id over local state.
      loadSeqRef.current += 1
      setOrders((prev) => prev.filter((o) => o.id !== id))
      setCancelledIds((prev) => {
        const next = new Set(prev)
        next.add(id)
        return next
      })
      setLocalOptimistic((prev) => (prev?.id === id ? null : prev))
      // Design §3.5: cancel-ok is info (~3.5s), not success.
      onToast?.({ kind: 'info', message: 'Order cancelled' })
      onCancelDone?.(id)
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

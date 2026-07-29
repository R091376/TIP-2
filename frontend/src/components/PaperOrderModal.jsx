import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  fetchPaperAccount,
  fetchPaperLtp,
  placePaperOrder,
} from '../services/paperApi'
import { PAPER_ORDER_TYPES, PAPER_PRODUCTS } from '../utils/paperOrderConstants'

function money(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Backend-parity client validation for paper place body.
 * Returns error string or '' when valid.
 */
export function validatePaperOrderFields({ side, orderType, qty, price, trigger }) {
  const q = Number(qty)
  if (!Number.isInteger(q) || q < 1) return 'Quantity must be an integer ≥ 1'

  const ot = (orderType || '').toUpperCase()
  const hasPrice = price !== '' && price != null
  const hasTrigger = trigger !== '' && trigger != null
  const px = hasPrice ? Number(price) : null
  const tpx = hasTrigger ? Number(trigger) : null

  if (ot === 'MARKET') {
    if (hasPrice || hasTrigger) return 'MARKET has no price/trigger'
    return ''
  }
  if (ot === 'LIMIT') {
    if (px == null || !(px > 0)) return 'LIMIT requires price > 0'
    if (hasTrigger) return 'LIMIT has no trigger'
    return ''
  }
  if (ot === 'SL') {
    if (px == null || !(px > 0)) return 'SL requires price > 0'
    if (tpx == null || !(tpx > 0)) return 'SL requires trigger > 0'
    const s = (side || '').toUpperCase()
    if (s === 'BUY' && px < tpx) return 'BUY SL requires price ≥ trigger'
    if (s === 'SELL' && px > tpx) return 'SELL SL requires price ≤ trigger'
    return ''
  }
  if (ot === 'SL_M') {
    if (hasPrice) return 'SL_M must not have price'
    if (tpx == null || !(tpx > 0)) return 'SL_M requires trigger > 0'
    return ''
  }
  return 'Invalid order type'
}

/**
 * Snapshot paper order ticket (instrumentKey fixed at open).
 * Symbol-switch detection is parent-owned; no live activeSymbolId prop.
 */
export default function PaperOrderModal({
  side,
  instrumentKey,
  tradingSymbol,
  onClose,
  onPlaced,
  onSubmittingChange,
  onPlaceError,
}) {
  const titleId = useId()
  const firstFieldRef = useRef(null)
  const submittingRef = useRef(false)
  const [product, setProduct] = useState('MIS')
  const [orderType, setOrderType] = useState('MARKET')
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState('')
  const [trigger, setTrigger] = useState('')
  const [ltp, setLtp] = useState(null)
  const [freeCash, setFreeCash] = useState(null)
  const [metaLoading, setMetaLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState('')

  const needsPrice = orderType === 'LIMIT' || orderType === 'SL'
  const needsTrigger = orderType === 'SL' || orderType === 'SL_M'

  const setSubmittingState = useCallback(
    (v) => {
      submittingRef.current = v
      setSubmitting(v)
      onSubmittingChange?.(v)
    },
    [onSubmittingChange],
  )

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Initial focus
  useEffect(() => {
    const t = requestAnimationFrame(() => {
      firstFieldRef.current?.focus()
    })
    return () => cancelAnimationFrame(t)
  }, [])

  // Esc — block while place in-flight
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (submittingRef.current) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      e.preventDefault()
      onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // LTP poll + free cash on open (snapshot instrumentKey)
  useEffect(() => {
    let cancelled = false
    const key = instrumentKey

    async function loadAccount() {
      try {
        const acc = await fetchPaperAccount()
        if (!cancelled) setFreeCash(acc?.freeCash ?? null)
      } catch {
        if (!cancelled) setFreeCash(null)
      }
    }

    async function loadLtp() {
      if (!key) return
      try {
        const res = await fetchPaperLtp(key)
        if (!cancelled) setLtp(res?.ltp ?? null)
      } catch {
        if (!cancelled) setLtp(null)
      }
    }

    setMetaLoading(true)
    Promise.all([loadAccount(), loadLtp()]).finally(() => {
      if (!cancelled) setMetaLoading(false)
    })

    const interval = setInterval(() => {
      if (document.hidden) return
      loadLtp()
    }, 2500)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [instrumentKey])

  function handleOrderTypeChange(next) {
    setOrderType(next)
    setFieldError('')
    if (next === 'MARKET' || next === 'SL_M') setPrice('')
    if (next === 'MARKET' || next === 'LIMIT') setTrigger('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submittingRef.current) return

    const err = validatePaperOrderFields({
      side,
      orderType,
      qty,
      price: needsPrice ? price : '',
      trigger: needsTrigger ? trigger : '',
    })
    if (err) {
      setFieldError(err)
      return
    }
    setFieldError('')

    const body = {
      instrumentKey,
      side,
      orderType,
      product,
      qty: Number(qty),
      clientOrderId: `chart-${crypto.randomUUID()}`,
    }
    if (needsPrice) body.price = Number(price)
    if (needsTrigger) body.triggerPrice = Number(trigger)
    // No closeLotId from chart ticket

    setSubmittingState(true)
    try {
      const order = await placePaperOrder(body)
      onPlaced?.(order)
    } catch (placeErr) {
      onPlaceError?.(placeErr)
    } finally {
      setSubmittingState(false)
    }
  }

  function handleBackdropClick(e) {
    if (e.target !== e.currentTarget) return
    if (submittingRef.current) return
    onClose?.()
  }

  function handleCancel() {
    if (submittingRef.current) return
    onClose?.()
  }

  if (typeof document === 'undefined') return null

  const sideClass =
    side === 'SELL' ? 'paper-order-modal__side--sell' : 'paper-order-modal__side--buy'

  return createPortal(
    <div
      className="paper-order-modal-backdrop"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="paper-order-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="paper-order-modal__header">
          <h2 id={titleId} className="paper-order-modal__title">
            Paper order
          </h2>
          <button
            type="button"
            className="paper-order-modal__close"
            aria-label="Close"
            disabled={submitting}
            onClick={handleCancel}
          >
            ×
          </button>
        </header>

        <div className="paper-order-modal__meta">
          <div className="paper-order-modal__symbol-row">
            <span className="paper-order-modal__symbol">
              {tradingSymbol || instrumentKey}
            </span>
            <span className={`paper-order-modal__side ${sideClass}`}>{side}</span>
          </div>
          <p className="paper-order-modal__quotes">
            LTP ₹{metaLoading && ltp == null ? '—' : money(ltp)}
            {' · '}
            Free ₹{metaLoading && freeCash == null ? '—' : money(freeCash)}
          </p>
        </div>

        <form className="paper-order-modal__form" onSubmit={handleSubmit}>
          <div className="paper-order-modal__row">
            <label className="paper-order-modal__field">
              Product
              <select
                ref={firstFieldRef}
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                disabled={submitting}
              >
                {PAPER_PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {p === 'MIS' ? 'MIS (intraday)' : 'CNC (overnight)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="paper-order-modal__field">
              Type
              <select
                value={orderType}
                onChange={(e) => handleOrderTypeChange(e.target.value)}
                disabled={submitting}
              >
                {PAPER_ORDER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === 'SL_M' ? 'SL-M' : t}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="paper-order-modal__field">
            Qty
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={qty}
              onChange={(e) => {
                setQty(e.target.value)
                setFieldError('')
              }}
              disabled={submitting}
              required
            />
          </label>

          {needsPrice ? (
            <label className="paper-order-modal__field">
              Price
              <input
                type="number"
                step="0.05"
                min="0"
                inputMode="decimal"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value)
                  setFieldError('')
                }}
                disabled={submitting}
                required
              />
            </label>
          ) : null}

          {needsTrigger ? (
            <label className="paper-order-modal__field">
              Trigger
              <input
                type="number"
                step="0.05"
                min="0"
                inputMode="decimal"
                value={trigger}
                onChange={(e) => {
                  setTrigger(e.target.value)
                  setFieldError('')
                }}
                disabled={submitting}
                required
              />
            </label>
          ) : null}

          {fieldError ? (
            <p className="paper-order-modal__error" role="alert">
              {fieldError}
            </p>
          ) : null}

          <div className="paper-order-modal__actions">
            <button
              type="button"
              className="paper-order-modal__cancel"
              disabled={submitting}
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`paper-order-modal__submit paper-order-modal__submit--${side === 'SELL' ? 'sell' : 'buy'}`}
              disabled={submitting}
            >
              {submitting ? 'Working…' : `Place ${side}`}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

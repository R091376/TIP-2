import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const DURATIONS = {
  success: 4000,
  error: 6000,
  info: 3500,
}

/**
 * Portal toast host for chart paper trade feedback.
 * success/info: polite status; error: assertive alert + dismiss.
 * z-index ≥ 1100; pause auto-dismiss on hover/focus.
 */
export default function PaperToastHost({ toasts = [], onDismiss }) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="paper-toast-host" aria-label="Notifications">
      {toasts.map((t) => (
        <PaperToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  )
}

function PaperToastItem({ toast, onDismiss }) {
  const { id, kind = 'info', message } = toast
  const [paused, setPaused] = useState(false)
  const remainingRef = useRef(DURATIONS[kind] ?? DURATIONS.info)
  const startedRef = useRef(Date.now())
  const timerRef = useRef(null)

  const dismiss = useCallback(() => {
    onDismiss?.(id)
  }, [id, onDismiss])

  useEffect(() => {
    if (paused) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedRef.current),
      )
      return undefined
    }

    startedRef.current = Date.now()
    const ms = remainingRef.current
    if (ms <= 0) {
      dismiss()
      return undefined
    }
    timerRef.current = setTimeout(dismiss, ms)
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [paused, dismiss])

  const isError = kind === 'error'
  const role = isError ? 'alert' : 'status'
  const live = isError ? 'assertive' : 'polite'
  const kindClass =
    kind === 'success'
      ? 'paper-toast--success'
      : kind === 'error'
        ? 'paper-toast--error'
        : 'paper-toast--info'

  return (
    <div
      className={`paper-toast ${kindClass}`}
      role={role}
      aria-live={live}
      aria-atomic="true"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="paper-toast__message">{message}</span>
      {isError ? (
        <button
          type="button"
          className="paper-toast__dismiss"
          aria-label="Dismiss notification"
          onClick={dismiss}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

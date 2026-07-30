/**
 * Shared toast state for chart + paper desk pages.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import PaperToastHost from '../components/PaperToast'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const pushToast = useCallback((toast) => {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    setToasts((prev) => [...prev, { id, ...toast }])
    return id
  }, [])

  const value = useMemo(
    () => ({ toasts, pushToast, dismissToast }),
    [toasts, pushToast, dismissToast],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <PaperToastHost toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

/** Optional: returns no-op helpers when outside provider (tests). */
export function useToasts() {
  const ctx = useContext(ToastContext)
  if (ctx) return ctx
  return {
    toasts: [],
    pushToast: () => null,
    dismissToast: () => {},
  }
}

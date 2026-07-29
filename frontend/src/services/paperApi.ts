/**
 * Paper trading REST client.
 */

import { api, ApiError } from './http'

export type PaperAccount = {
  cashBalance: number
  lockedCash: number
  freeCash: number
}

export type PaperLtp = {
  instrumentKey: string
  ltp: number | null
  timestampMs: number | null
}

export type PaperApiErrorShape = {
  code?: string
  message: string
  status?: number
}

/**
 * Normalize paper API errors for toasts / inline UI.
 * Toast format: code ? `${code} — ${message}` : message
 */
export function parsePaperApiError(err: unknown): PaperApiErrorShape {
  if (err instanceof ApiError) {
    const shape: PaperApiErrorShape = {
      message: err.message,
      status: err.status,
    }
    if (err.code) shape.code = err.code
    return shape
  }

  if (err instanceof Error) {
    const msg = err.message?.trim() || 'Request failed'

    // JSON body stringified into Error.message
    try {
      const parsed = JSON.parse(msg) as Record<string, unknown>
      if (parsed && typeof parsed === 'object') {
        const detail = parsed.detail
        let code: string | undefined
        let message: string | undefined

        if (typeof parsed.code === 'string' && parsed.code.trim()) {
          code = parsed.code.trim()
        }
        if (typeof parsed.message === 'string' && parsed.message.trim()) {
          message = parsed.message.trim()
        }

        if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
          const d = detail as Record<string, unknown>
          if (!code && typeof d.code === 'string' && d.code.trim()) {
            code = d.code.trim()
          }
          if (!message && typeof d.message === 'string' && d.message.trim()) {
            message = d.message.trim()
          }
        } else if (typeof detail === 'string' && detail.trim() && !message) {
          message = detail.trim()
        }

        if (message || code) {
          return {
            message: message || msg,
            ...(code ? { code } : {}),
          }
        }
      }
    } catch {
      /* not JSON */
    }

    // Already formatted as "CODE — message" (em dash)
    const em = msg.indexOf(' — ')
    if (em > 0) {
      const code = msg.slice(0, em).trim()
      const message = msg.slice(em + 3).trim()
      if (code && message && /^[A-Z][A-Z0-9_]*$/.test(code)) {
        return { code, message }
      }
    }

    return { message: msg }
  }

  return { message: String(err) }
}

export type PaperOrder = {
  id: string
  instrumentKey: string
  tradingSymbol: string
  side: string
  orderType: string
  product: string
  qty: number
  filledQty: number
  price: number | null
  triggerPrice: number | null
  status: string
  rejectReason: string | null
  closeLotId: string | null
  createdAt: string | null
}

export type PaperPosition = {
  id: string
  instrumentKey: string
  tradingSymbol: string
  side: string
  product: string
  qtyOpen: number
  qtyClosed?: number
  avgEntryPrice: number
  realizedPnl: number
  unrealizedPnl: number | null
  ltp: number | null
  status: string
  entryOrderId?: string | null
  openedAt?: string | null
  closedAt?: string | null
}

export type PlaceOrderRequest = {
  instrumentKey: string
  side: string
  orderType: string
  product: string
  qty: number
  price?: number | null
  triggerPrice?: number | null
  closeLotId?: string | null
  clientOrderId?: string | null
}

export async function fetchPaperAccount(): Promise<PaperAccount> {
  return api<PaperAccount>('/api/paper/account')
}

export async function fetchPaperOrders(
  status?: string,
  opts?: { limit?: number },
): Promise<PaperOrder[]> {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (opts?.limit != null) params.set('limit', String(opts.limit))
  const q = params.toString()
  return api<PaperOrder[]>(`/api/paper/orders${q ? `?${q}` : ''}`)
}

export async function fetchPaperPositions(openOnly = true): Promise<PaperPosition[]> {
  return api<PaperPosition[]>(`/api/paper/positions?openOnly=${openOnly}`)
}

export type PaperFill = {
  id: string
  orderId: string
  userId?: string
  instrumentKey: string
  side: string
  qty: number
  price: number
  amount: number
  tickTsMs?: number
  lotId: string | null
  createdAt: string | null
}

export async function fetchPaperFills(opts?: { limit?: number }): Promise<PaperFill[]> {
  const params = new URLSearchParams()
  if (opts?.limit != null) params.set('limit', String(opts.limit))
  const q = params.toString()
  return api<PaperFill[]>(`/api/paper/fills${q ? `?${q}` : ''}`)
}

export async function fetchPaperLedger(): Promise<unknown[]> {
  return api<unknown[]>('/api/paper/ledger')
}

export async function placePaperOrder(body: PlaceOrderRequest): Promise<PaperOrder> {
  return api<PaperOrder>('/api/paper/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function cancelPaperOrder(id: string): Promise<PaperOrder> {
  return api<PaperOrder>(`/api/paper/orders/${id}`, { method: 'DELETE' })
}

/** GET /api/paper/ltp/{instrumentKey} — LTP may be null when no quote yet. */
export async function fetchPaperLtp(instrumentKey: string): Promise<PaperLtp> {
  return api<PaperLtp>(`/api/paper/ltp/${encodeURIComponent(instrumentKey)}`)
}

/**
 * Paper trading REST client.
 */

import { api } from './http'

export type PaperAccount = {
  cashBalance: number
  lockedCash: number
  freeCash: number
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
  avgEntryPrice: number
  realizedPnl: number
  unrealizedPnl: number | null
  ltp: number | null
  status: string
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

export async function fetchPaperOrders(status?: string): Promise<PaperOrder[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  return api<PaperOrder[]>(`/api/paper/orders${q}`)
}

export async function fetchPaperPositions(openOnly = true): Promise<PaperPosition[]> {
  return api<PaperPosition[]>(`/api/paper/positions?openOnly=${openOnly}`)
}

export async function fetchPaperFills(): Promise<unknown[]> {
  return api<unknown[]>('/api/paper/fills')
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

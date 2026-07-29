/**
 * Paper P&L helpers.
 *
 * Overall (from lots):
 * - overallRealized   = sum of realizedPnl on all lots
 * - overallUnrealized = sum of unrealizedPnl on open lots
 * - overallTotal      = overallRealized + overallUnrealized
 *
 * Day (IST calendar day):
 * - dayRealized   = sum of realized P&L on **close/cover fills** whose
 *                   createdAt falls on today (IST). Uses lot avg entry ×
 *                   fill price — not cumulative lot.realizedPnl heuristics.
 * - dayUnrealized = overallUnrealized (open mark-to-market; not session delta)
 * - dayTotal      = dayRealized + dayUnrealized
 *
 * When fill history is truncated, dayRealized may undercount (never
 * over-attribute multi-day lot cumulative realized to a single day).
 */

import { realizedClosePnl } from './paperOrderPnl'

export type PaperLotLike = {
  id?: string
  status?: string
  realizedPnl?: number | null
  unrealizedPnl?: number | null
  avgEntryPrice?: number | null
  openedAt?: string | null
  closedAt?: string | null
}

export type PaperOrderLike = {
  id: string
  side?: string
  closeLotId?: string | null
}

export type PaperFillLike = {
  orderId: string
  lotId?: string | null
  side?: string
  qty: number
  price: number
  createdAt?: string | null
}

/** Calendar date YYYY-MM-DD in Asia/Kolkata (NSE session day). */
export function istDateKey(isoOrDate?: string | Date | null): string | null {
  if (isoOrDate == null || isoOrDate === '') return null
  try {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  } catch {
    return null
  }
}

export function todayIstDateKey(): string {
  return istDateKey(new Date()) || new Date().toISOString().slice(0, 10)
}

function num(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? v : 0
}

export type PaperPnlSummary = {
  overallRealized: number
  overallUnrealized: number
  overallTotal: number
  dayRealized: number
  dayUnrealized: number
  dayTotal: number
}

export type ComputePaperPnlOptions = {
  todayKey?: string
  /** All fills (used only for day realized on close/cover orders) */
  fills?: PaperFillLike[] | null
  /** Orders (to know closeLotId + side) */
  orders?: PaperOrderLike[] | null
}

/**
 * Day realized from close/cover fills dated today (IST).
 */
export function computeDayRealizedFromCloseFills(
  fills: PaperFillLike[] | null | undefined,
  orders: PaperOrderLike[] | null | undefined,
  lots: PaperLotLike[] | null | undefined,
  todayKey: string = todayIstDateKey(),
): number {
  const ordersById = new Map<string, PaperOrderLike>()
  for (const o of orders || []) {
    if (o?.id) ordersById.set(o.id, o)
  }
  const lotsById = new Map<string, PaperLotLike>()
  for (const L of lots || []) {
    if (L?.id) lotsById.set(L.id, L)
  }

  let day = 0
  for (const f of fills || []) {
    if (istDateKey(f.createdAt) !== todayKey) continue
    const order = ordersById.get(f.orderId)
    // Only close/cover orders produce realized P&L
    if (!order?.closeLotId) continue

    const lot =
      lotsById.get(String(order.closeLotId)) ||
      (f.lotId ? lotsById.get(f.lotId) : undefined)
    if (!lot || !Number.isFinite(Number(lot.avgEntryPrice))) continue

    const qty = num(f.qty)
    const px = Number(f.price)
    if (qty <= 0 || !Number.isFinite(px)) continue

    const side = order.side || f.side || ''
    day += realizedClosePnl(side, Number(lot.avgEntryPrice), px, qty)
  }
  return day
}

export function computePaperPnl(
  lots: PaperLotLike[] | null | undefined,
  options: ComputePaperPnlOptions = {},
): PaperPnlSummary {
  const todayKey = options.todayKey ?? todayIstDateKey()
  let overallRealized = 0
  let overallUnrealized = 0

  for (const lot of lots || []) {
    overallRealized += num(lot.realizedPnl)
    if ((lot.status || '').toUpperCase() === 'OPEN') {
      overallUnrealized += num(lot.unrealizedPnl)
    }
  }

  // Prefer fill-based day realized when fills+orders provided
  let dayRealized = 0
  if (options.fills != null && options.orders != null) {
    dayRealized = computeDayRealizedFromCloseFills(
      options.fills,
      options.orders,
      lots,
      todayKey,
    )
  }

  const dayUnrealized = overallUnrealized
  return {
    overallRealized,
    overallUnrealized,
    overallTotal: overallRealized + overallUnrealized,
    dayRealized,
    dayUnrealized,
    dayTotal: dayRealized + dayUnrealized,
  }
}

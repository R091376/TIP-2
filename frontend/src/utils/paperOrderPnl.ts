/**
 * Per-order P&L from fills + lots.
 *
 * - Close / cover orders (`closeLotId`): realized vs lot avg entry.
 * - Entry orders with open lot + LTP: unrealized on filled qty vs LTP.
 * - Qty authority is always `order.filledQty` (not a partial fill window).
 * - Avg fill is used only when fill qty sums to `order.filledQty`; incomplete
 *   fill windows return null value rather than a skewed partial VWAP.
 * - Entry lot: fill.lotId first, then lot.entryOrderId === order.id.
 */

export type OrderPnlKind = 'realized' | 'unrealized' | 'none'

export type OrderPnlResult = {
  kind: OrderPnlKind
  /** null when unknown / not applicable */
  value: number | null
  /** Average fill price used in the calc */
  avgFillPrice: number | null
  filledQty: number
  /** True when fill rows do not fully cover order.filledQty */
  fillsIncomplete?: boolean
}

export type OrderLike = {
  id: string
  side?: string
  filledQty?: number
  closeLotId?: string | null
  status?: string
  price?: number | null
}

export type FillLike = {
  orderId: string
  lotId?: string | null
  qty: number
  price: number
  createdAt?: string | null
  side?: string
  /** Per-fill net close/cover delta. Null on entry fills. */
  realizedPnl?: number | null
  chargesTotal?: number | null
  allocatedEntryCharges?: number | null
}

export type LotLike = {
  id: string
  avgEntryPrice: number
  unrealizedPnl?: number | null
  ltp?: number | null
  qtyOpen?: number
  status?: string
  side?: string
  entryOrderId?: string | null
}

export function avgFillPrice(fills: FillLike[]): number | null {
  let qty = 0
  let notional = 0
  for (const f of fills) {
    const q = Number(f.qty) || 0
    const p = Number(f.price)
    if (q <= 0 || !Number.isFinite(p)) continue
    qty += q
    notional += q * p
  }
  if (qty <= 0) return null
  return notional / qty
}

export function groupFillsByOrderId(fills: FillLike[] | null | undefined): Map<string, FillLike[]> {
  const map = new Map<string, FillLike[]>()
  for (const f of fills || []) {
    const id = f.orderId
    if (!id) continue
    const list = map.get(id)
    if (list) list.push(f)
    else map.set(id, [f])
  }
  return map
}

export function indexLotsById(lots: LotLike[] | null | undefined): Map<string, LotLike> {
  const map = new Map<string, LotLike>()
  for (const L of lots || []) {
    if (L?.id) map.set(L.id, L)
  }
  return map
}

export function indexLotsByEntryOrderId(
  lots: LotLike[] | null | undefined,
): Map<string, LotLike> {
  const map = new Map<string, LotLike>()
  for (const L of lots || []) {
    if (L?.entryOrderId) map.set(String(L.entryOrderId), L)
  }
  return map
}

/**
 * Realized PnL for a close/cover: SELL vs long entry, BUY vs short entry.
 */
export function realizedClosePnl(
  side: string,
  avgEntry: number,
  avgExit: number,
  qty: number,
): number {
  const s = (side || '').toUpperCase()
  if (s === 'SELL') {
    // Close long
    return (avgExit - avgEntry) * qty
  }
  // BUY cover short
  return (avgEntry - avgExit) * qty
}

/**
 * Unrealized on remaining open exposure from an entry fill avg.
 */
export function unrealizedEntryPnl(
  side: string,
  avgEntry: number,
  ltp: number,
  qty: number,
): number {
  const s = (side || '').toUpperCase()
  if (s === 'BUY') {
    // Long
    return (ltp - avgEntry) * qty
  }
  // Short
  return (avgEntry - ltp) * qty
}

function fillQtySum(fills: FillLike[]): number {
  return fills.reduce((s, f) => s + (Number(f.qty) || 0), 0)
}

/**
 * Resolve average fill price.
 * - Prefer VWAP only when fill qty covers order.filledQty (complete window).
 * - Else LIMIT/SL order.price as proxy when present.
 * - Else incomplete → null (do not partial-VWAP).
 */
export function resolveOrderAvgFill(
  order: OrderLike,
  fillsForOrder: FillLike[],
): { avg: number | null; fillsIncomplete: boolean; fillSum: number } {
  const orderFilledQty = Number(order.filledQty) || 0
  const fillSum = fillQtySum(fillsForOrder)
  const fillsIncomplete = orderFilledQty > 0 && fillSum < orderFilledQty

  if (orderFilledQty > 0 && fillSum >= orderFilledQty && fillSum > 0) {
    // Complete (or over-complete) fill set — use VWAP of all fills for this order
    return { avg: avgFillPrice(fillsForOrder), fillsIncomplete: false, fillSum }
  }

  if (order.price != null && Number.isFinite(Number(order.price))) {
    // Limit/SL price as best proxy when fills truncated or absent
    return { avg: Number(order.price), fillsIncomplete, fillSum }
  }

  // MARKET with incomplete/missing fills — refuse partial VWAP
  return {
    avg: null,
    fillsIncomplete: Boolean(fillsIncomplete || (orderFilledQty > 0 && fillSum === 0) || fillSum > 0),
    fillSum,
  }
}

export function resolveEntryLot(
  order: OrderLike,
  fillsForOrder: FillLike[],
  lotsById: Map<string, LotLike>,
  lotsByEntryOrderId: Map<string, LotLike>,
): LotLike | undefined {
  for (const f of fillsForOrder) {
    if (f.lotId && lotsById.has(f.lotId)) {
      return lotsById.get(f.lotId)
    }
  }
  return lotsByEntryOrderId.get(order.id)
}

export function computeOrderPnl(
  order: OrderLike,
  fillsForOrder: FillLike[],
  lotsById: Map<string, LotLike>,
  lotsByEntryOrderId: Map<string, LotLike> = new Map(),
): OrderPnlResult {
  // Qty authority is always the order row from the API
  const filledQty = Number(order.filledQty) || 0
  if (filledQty <= 0) {
    return { kind: 'none', value: null, avgFillPrice: null, filledQty: 0 }
  }

  const { avg, fillsIncomplete } = resolveOrderAvgFill(order, fillsForOrder)
  const isClose = Boolean(order.closeLotId)

  // Close / cover path
  if (isClose) {
    const everyHasNet =
      fillsForOrder.length > 0 &&
      fillsForOrder.every(
        (f) => f.realizedPnl != null && Number.isFinite(Number(f.realizedPnl)),
      )
    if (everyHasNet && !fillsIncomplete) {
      const value = fillsForOrder.reduce((s, f) => s + Number(f.realizedPnl), 0)
      return {
        kind: 'realized',
        value,
        avgFillPrice: avg,
        filledQty,
        fillsIncomplete,
      }
    }

    if (avg == null) {
      return {
        kind: 'realized',
        value: null,
        avgFillPrice: null,
        filledQty,
        fillsIncomplete,
      }
    }

    const lot =
      lotsById.get(String(order.closeLotId)) ||
      fillsForOrder.map((f) => (f.lotId ? lotsById.get(f.lotId) : undefined)).find(Boolean)
    if (!lot || !Number.isFinite(Number(lot.avgEntryPrice))) {
      return {
        kind: 'realized',
        value: null,
        avgFillPrice: avg,
        filledQty,
        fillsIncomplete,
      }
    }
    const gross = realizedClosePnl(
      order.side || '',
      Number(lot.avgEntryPrice),
      avg,
      filledQty,
    )
    // Truncated fill windows would under-subtract; keep gross when incomplete.
    const charges = fillsIncomplete
      ? 0
      : fillsForOrder.reduce(
          (s, f) =>
            s + (Number(f.chargesTotal) || 0) + (Number(f.allocatedEntryCharges) || 0),
          0,
        )
    return {
      kind: 'realized',
      value: gross - charges,
      avgFillPrice: avg,
      filledQty,
      fillsIncomplete,
    }
  }

  if (avg == null) {
    return {
      kind: 'unrealized',
      value: null,
      avgFillPrice: null,
      filledQty,
      fillsIncomplete,
    }
  }

  // Entry path
  const lot = resolveEntryLot(order, fillsForOrder, lotsById, lotsByEntryOrderId)

  if (!lot || (lot.status || '').toUpperCase() !== 'OPEN') {
    // Entry already fully closed via other orders — P&L lives on those close orders
    return {
      kind: 'none',
      value: null,
      avgFillPrice: avg,
      filledQty,
      fillsIncomplete,
    }
  }

  const ltp = lot.ltp
  if (ltp == null || !Number.isFinite(Number(ltp))) {
    return {
      kind: 'unrealized',
      value: null,
      avgFillPrice: avg,
      filledQty,
      fillsIncomplete,
    }
  }

  // Cap qty to what's still open on the lot
  const openQty = Number(lot.qtyOpen)
  const qty =
    Number.isFinite(openQty) && openQty > 0 ? Math.min(filledQty, openQty) : filledQty
  const value = unrealizedEntryPnl(order.side || '', avg, Number(ltp), qty)
  return {
    kind: 'unrealized',
    value,
    avgFillPrice: avg,
    filledQty: qty,
    fillsIncomplete,
  }
}

export function buildOrderPnlMap(
  orders: OrderLike[],
  fills: FillLike[],
  lots: LotLike[],
): Map<string, OrderPnlResult> {
  const byOrder = groupFillsByOrderId(fills)
  const lotsById = indexLotsById(lots)
  const lotsByEntry = indexLotsByEntryOrderId(lots)
  const map = new Map<string, OrderPnlResult>()
  for (const o of orders) {
    map.set(o.id, computeOrderPnl(o, byOrder.get(o.id) || [], lotsById, lotsByEntry))
  }
  return map
}

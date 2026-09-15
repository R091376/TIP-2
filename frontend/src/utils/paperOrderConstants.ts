/** Open paper order statuses (backend OPEN_STATUSES). */
export const OPEN_ORDER_STATUSES = ['OPEN', 'TRIGGER_PENDING', 'PARTIALLY_FILLED'] as const

export const PAPER_ORDER_TYPES = ['MARKET', 'LIMIT', 'SL', 'SL_M'] as const

export const PAPER_PRODUCTS = ['MIS', 'CNC'] as const

const MIS_ONLY = ['MIS'] as const

export type OpenOrderStatus = (typeof OPEN_ORDER_STATUSES)[number]
export type PaperOrderType = (typeof PAPER_ORDER_TYPES)[number]
export type PaperProduct = (typeof PAPER_PRODUCTS)[number]

/** Products for a new open (no closeLotId). CNC sell is close-only. */
export function paperProductsForOpenSide(side: string): readonly PaperProduct[] {
  return (side || '').toUpperCase() === 'SELL' ? MIS_ONLY : PAPER_PRODUCTS
}

/** Naked CNC SELL (no closeLotId) would open a delivery short — not allowed. */
export function isCncOpenShort(side: string, product: string, closeLotId?: string | null): boolean {
  return (
    (product || '').toUpperCase() === 'CNC' &&
    (side || '').toUpperCase() === 'SELL' &&
    !closeLotId
  )
}

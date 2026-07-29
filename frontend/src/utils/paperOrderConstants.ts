/** Open paper order statuses (backend OPEN_STATUSES). */
export const OPEN_ORDER_STATUSES = ['OPEN', 'TRIGGER_PENDING', 'PARTIALLY_FILLED'] as const

export const PAPER_ORDER_TYPES = ['MARKET', 'LIMIT', 'SL', 'SL_M'] as const

export const PAPER_PRODUCTS = ['MIS', 'CNC'] as const

export type OpenOrderStatus = (typeof OPEN_ORDER_STATUSES)[number]
export type PaperOrderType = (typeof PAPER_ORDER_TYPES)[number]
export type PaperProduct = (typeof PAPER_PRODUCTS)[number]

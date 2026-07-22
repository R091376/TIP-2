import { api } from './http'

export function encodeSymbolId(symbolId: string): string {
  return encodeURIComponent(symbolId)
}

export type WatchlistEntryDto = {
  symbolId: string
  tradingSymbol?: string
  displayName?: string
  exchange?: string
  segment?: string
  instrumentType?: string
  bootstrapStatus?: string
  bootstrapError?: string | null
  active?: boolean
}

/** GET /api/watchlist */
export async function fetchWatchlist(): Promise<WatchlistEntryDto[]> {
  const data = await api<WatchlistEntryDto[]>('/api/watchlist')
  return Array.isArray(data) ? data : []
}

/**
 * POST /api/watchlist — blocking add (ADMIN only).
 */
export async function addSymbol(
  input: string | { symbol?: string; instrumentKey?: string },
): Promise<WatchlistEntryDto> {
  let body: { symbol?: string; instrumentKey?: string }
  if (typeof input === 'string') {
    body = { symbol: input }
  } else if (input && typeof input === 'object') {
    body = {}
    if (input.instrumentKey) body.instrumentKey = input.instrumentKey
    if (input.symbol) body.symbol = input.symbol
  } else {
    body = {}
  }

  return api<WatchlistEntryDto>('/api/watchlist', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/** DELETE /api/watchlist/{symbolId} (ADMIN only). */
export async function removeSymbol(symbolId: string): Promise<null> {
  return api(`/api/watchlist/${encodeSymbolId(symbolId)}`, { method: 'DELETE' })
}

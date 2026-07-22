import { encodeSymbolId } from './watchlistApi'
import { api } from './http'

export const DEFAULT_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const
export const DEFAULT_TIMEFRAME = '5m'

export type CandleDto = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type MarketStatusDto = {
  marketPhase?: string
  bootstrapStatus?: string
  bootstrapError?: string | null
  lastSeededAt?: string | null
  liveFeedConnected?: boolean
  candleCount?: number
}

export type TimeframesDto = {
  defaultTimeframe?: string
  supported?: string[]
}

export async function fetchMarketStatus(): Promise<MarketStatusDto> {
  return api<MarketStatusDto>('/api/market/status')
}

/**
 * Supported timeframes. Falls back to hardcoded defaults if the request fails.
 */
export async function fetchTimeframes(): Promise<TimeframesDto> {
  try {
    return await api<TimeframesDto>('/api/market/timeframes')
  } catch {
    return { defaultTimeframe: DEFAULT_TIMEFRAME, supported: [...DEFAULT_TIMEFRAMES] }
  }
}

export async function fetchCandles({
  symbolId,
  timeframe,
  from,
  to,
}: {
  symbolId: string
  timeframe?: string
  from?: number
  to?: number
} = {} as { symbolId: string }): Promise<CandleDto[]> {
  if (!symbolId) {
    throw new Error('symbolId is required to fetch candles')
  }

  const params = new URLSearchParams()
  if (timeframe != null) params.set('timeframe', timeframe)
  if (from != null) params.set('from', String(from))
  if (to != null) params.set('to', String(to))

  const query = params.toString()
  const base = `/api/symbols/${encodeSymbolId(symbolId)}/candles`
  const url = query ? `${base}?${query}` : base
  const data = await api<CandleDto[]>(url)
  return Array.isArray(data) ? data : []
}

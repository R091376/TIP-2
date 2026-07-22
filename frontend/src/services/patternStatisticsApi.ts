import { api } from './http'

export type PatternStatisticsItem = {
  status: 'ok' | 'insufficient_history' | string
  symbolId: string
  tradingSymbol?: string | null
  displayName?: string | null
  patternType: string
  timeframe: string
  sampleSize: number
  successCount: number
  failCount: number
  expiredCount: number
  minSampleSize: number
  successRate: number | null
  resolvedSuccessRate: number | null
  resolvedSampleSize: number | null
  avgMoveR: number | null
  avgDurationCandles: number | null
  avgMfeR: number | null
  avgMaeR: number | null
  moveSampleSize?: number | null
  mfeSampleSize?: number | null
  maeSampleSize?: number | null
  updatedAt?: string | null
}

export type PatternStatisticsResponse = {
  minSampleSize: number
  count: number
  items: PatternStatisticsItem[]
}

export type FetchPatternStatisticsParams = {
  patternType?: string
  timeframe?: string
}

/** GET /api/pattern-statistics — bulk ranking over active watchlist. */
export async function fetchPatternStatistics(
  params: FetchPatternStatisticsParams = {},
): Promise<PatternStatisticsResponse> {
  const qs = new URLSearchParams()
  if (params.patternType) qs.set('patternType', params.patternType)
  if (params.timeframe) qs.set('timeframe', params.timeframe)
  const query = qs.toString()
  const path = query ? `/api/pattern-statistics?${query}` : '/api/pattern-statistics'
  const data = await api<PatternStatisticsResponse>(path)
  return {
    minSampleSize: data?.minSampleSize ?? 20,
    count: data?.count ?? 0,
    items: Array.isArray(data?.items) ? data.items : [],
  }
}

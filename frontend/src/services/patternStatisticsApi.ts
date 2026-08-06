import { api } from './http'
import type { ResearchFilterParams } from '../utils/researchFilters'
import { serializeResearchFilters } from '../utils/researchFilters'

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
  /** Planned R:R = avgRewardR / avgRiskR (ratio of averages from final rails) */
  avgPlannedRr: number | null
  /** Average |entry−stop| / ATR at detect */
  avgRiskR: number | null
  /** Average favorable entry→target / ATR at detect */
  avgRewardR: number | null
  /** Min / max / median of per-trade planned R:R (secondary) */
  minPlannedRr?: number | null
  maxPlannedRr?: number | null
  medianPlannedRr?: number | null
  moveSampleSize?: number | null
  mfeSampleSize?: number | null
  maeSampleSize?: number | null
  plannedRrSampleSize?: number | null
  updatedAt?: string | null
  /** Research-only */
  expectancyR?: number | null
  avgWinMoveR?: number | null
  avgLossMoveR?: number | null
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

export type ResearchSummary = {
  sampleSize: number
  successCount: number
  failCount: number
  expiredCount: number
  resolvedSampleSize: number
  ready: boolean
  readyGroupCount: number
  successRate: number | null
  resolvedSuccessRate: number | null
  expectancyR: number | null
  avgMoveR: number | null
  avgPlannedRr: number | null
  scannedFrom: string | null
  scannedTo: string | null
}

export type ResearchStatisticsResponse = {
  minSampleSize: number
  groupBy: string
  totalMatched: number
  totalGroups: number
  count: number
  truncated: boolean
  filters: Record<string, unknown>
  summary: ResearchSummary
  disclaimer: string
  items: PatternStatisticsItem[]
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

/** GET /api/pattern-statistics/query — ADMIN research / composable filters. */
export async function fetchResearchStatistics(
  params: ResearchFilterParams = {},
): Promise<ResearchStatisticsResponse> {
  const qs = serializeResearchFilters(params)
  const path = qs
    ? `/api/pattern-statistics/query?${qs}`
    : '/api/pattern-statistics/query'
  const data = await api<ResearchStatisticsResponse>(path)
  return {
    minSampleSize: data?.minSampleSize ?? 20,
    groupBy: data?.groupBy ?? 'symbol,patternType,timeframe',
    totalMatched: data?.totalMatched ?? 0,
    totalGroups: data?.totalGroups ?? 0,
    count: data?.count ?? 0,
    truncated: Boolean(data?.truncated),
    filters: data?.filters && typeof data.filters === 'object' ? data.filters : {},
    summary: data?.summary ?? {
      sampleSize: 0,
      successCount: 0,
      failCount: 0,
      expiredCount: 0,
      resolvedSampleSize: 0,
      ready: false,
      readyGroupCount: 0,
      successRate: null,
      resolvedSuccessRate: null,
      expectancyR: null,
      avgMoveR: null,
      avgPlannedRr: null,
      scannedFrom: null,
      scannedTo: null,
    },
    disclaimer:
      data?.disclaimer ||
      'Research over virtual pattern-journal outcomes; not brokerage advice.',
    items: Array.isArray(data?.items) ? data.items : [],
  }
}

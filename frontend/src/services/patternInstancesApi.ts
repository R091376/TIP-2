import { api } from './http'
import { encodeSymbolId } from './watchlistApi'

/** Full pattern instance DTO from GET /api/symbols/{id}/patterns */
export type PatternInstanceDto = {
  id: string
  symbolId: string
  timeframe: string
  patternType: string
  direction: string
  stage?: string
  status?: string
  flagConfirmed?: boolean
  flagRetested?: boolean
  flagStrengthened?: boolean
  referenceLevel?: number
  lookbackHigh?: number
  atrAtDetect?: number
  entryPrice?: number
  stopLevel?: number
  targetLevel?: number
  retestFloor?: number | null
  detectCandleTime?: number
  detectedAt?: string | null
  confirmedAt?: string | null
  mfePrice?: number
  maePrice?: number
  durationCandles?: number
  detectorVersion?: string
  terminal?: boolean
  finalOutcome?: string | null
  terminalReason?: string | null
  endPrice?: number | null
  active?: boolean
  geometry?: ClassicalGeometry | null
}

export type ClassicalPivot = {
  role: string
  index?: number
  time?: number
  price?: number
  high?: boolean
}

export type ClassicalGeometry = {
  kind?: string
  version?: number
  pivots?: ClassicalPivot[]
  confirmation?: { style?: string; price?: number; leftTime?: number; rightTime?: number }
  neckline?: {
    style?: string
    p1Time?: number
    p1Price?: number
    p2Time?: number
    p2Price?: number
    priceAtBreak?: number
    slopePerBar?: number
  }
  patternHeight?: number
  breakIndex?: number
  breakTime?: number
  breakPrice?: number
}

export type FetchSymbolPatternsParams = {
  status?: 'active' | 'closed' | 'all'
  timeframe?: string
  instanceId?: string
}

/**
 * GET /api/symbols/{symbolId}/patterns
 * Returns instance list with entry/stop/target/ATR rails.
 */
export async function fetchSymbolPatterns(
  symbolId: string,
  params: FetchSymbolPatternsParams = {},
): Promise<PatternInstanceDto[]> {
  if (!symbolId) return []
  const qs = new URLSearchParams()
  if (params.instanceId) {
    qs.set('instanceId', params.instanceId)
  } else {
    qs.set('status', params.status || 'all')
    if (params.timeframe) qs.set('timeframe', params.timeframe)
  }
  const path = `/api/symbols/${encodeSymbolId(symbolId)}/patterns?${qs.toString()}`
  const data = await api<{ patterns?: PatternInstanceDto[]; instances?: PatternInstanceDto[] }>(
    path,
  )
  const list = data?.patterns ?? data?.instances
  return Array.isArray(list) ? list : []
}

/**
 * Resolve one instance by id (single API call — no list fan-out).
 */
export async function fetchPatternInstance(
  symbolId: string,
  instanceId: string,
  _timeframe?: string | null,
): Promise<PatternInstanceDto | null> {
  if (!symbolId || !instanceId) return null
  try {
    const list = await fetchSymbolPatterns(symbolId, { instanceId: String(instanceId) })
    const found = list.find((x) => String(x.id) === String(instanceId))
    return found ?? list[0] ?? null
  } catch {
    return null
  }
}

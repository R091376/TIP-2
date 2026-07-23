/**
 * GET /api/pattern-alerts — today's pattern stage events (IST day).
 * Restores the alerts feed after browser refresh.
 */

import { api } from './http'

export type PatternAlertDto = {
  id: string
  symbolId: string
  timeframe: string
  patternType: string
  stage: string
  price: number
  time: number
  referenceLevel?: number
  instanceId: string
  direction?: string
  status?: string
  receivedAt?: number
}

export type PatternAlertsResponse = {
  day: string
  count: number
  items: PatternAlertDto[]
}

export async function fetchTodayPatternAlerts(params?: {
  day?: string
  limit?: number
  symbolId?: string
  timeframe?: string
}): Promise<PatternAlertDto[]> {
  const q = new URLSearchParams()
  if (params?.day) q.set('day', params.day)
  if (params?.limit != null) q.set('limit', String(params.limit))
  if (params?.symbolId) q.set('symbolId', params.symbolId)
  if (params?.timeframe) q.set('timeframe', params.timeframe)
  // Include session-close / max-duration expired stages in the day feed.
  q.set('includeExpired', 'true')
  const qs = q.toString()
  const path = qs ? `/api/pattern-alerts?${qs}` : '/api/pattern-alerts'
  const body = await api<PatternAlertsResponse>(path)
  const items = Array.isArray(body?.items) ? body.items : []
  // Defensive: ensure required FE fields
  return items
    .filter((a) => a && a.symbolId && a.timeframe != null && a.time != null)
    .map((a) => ({
      ...a,
      id:
        a.id ||
        `${a.instanceId || 'x'}:${(a.stage || 'event').toLowerCase()}:${a.time}:${a.price}`,
      stage: (a.stage || '').toLowerCase(),
      receivedAt: a.receivedAt ?? Date.now(),
    }))
}

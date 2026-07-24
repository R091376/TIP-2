import { apiUrl } from '../config'

export type HealthDto = {
  status?: string
  database?: string
  databaseError?: string
  marketPhase?: string
  liveFeedConnected?: boolean
  bootstrapStatus?: string
  databaseHost?: string
  journal?: string
  journalError?: string
  [key: string]: unknown
}

/**
 * Liveness/readiness probe. Public endpoint — no auth required.
 * Uses lightweight health by default (no heavy journal counts).
 * Throws if the process is unreachable or returns non-OK.
 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthDto> {
  const response = await fetch(apiUrl('/api/health'), {
    method: 'GET',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    throw new Error(`Health check failed (${response.status})`)
  }
  return (await response.json()) as HealthDto
}

/** True when Postgres is ready, or not required (memory / SKIPPED). */
export function isDatabaseReady(health: HealthDto): boolean {
  const db = String(health.database || '').toUpperCase()
  return db === 'UP' || db === 'SKIPPED'
}

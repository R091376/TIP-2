import { isDatabaseReady, type HealthDto } from '../services/healthApi'
import {
  STARTUP_READY_POLL_MS,
  STARTUP_READY_TIMEOUT_MS,
} from '../config/featureFlags'
import { anyAbortSignal, isAbortError, timeoutSignal } from '../utils/abort'

export type StepStatus = 'pending' | 'running' | 'done' | 'failed'

export type StartupStepKey = 'api' | 'postgres' | 'session'

export type StartupProgress = {
  api: StepStatus
  postgres: StepStatus
  session: StepStatus
  lastError: string | null
}

export class StartupTimeoutError extends Error {
  step: StartupStepKey
  constructor(step: StartupStepKey, message?: string) {
    super(message || `Timed out waiting for ${step}`)
    this.name = 'StartupTimeoutError'
    this.step = step
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Run fetchHealth but reject as soon as `signal` aborts — even if the
 * underlying promise ignores AbortSignal (hung TCP / bad mocks).
 */
function fetchHealthUntilAbort(
  fetchHealth: (signal?: AbortSignal) => Promise<HealthDto>,
  signal: AbortSignal,
): Promise<HealthDto> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      fn()
    }
    const onAbort = () => {
      finish(() => reject(new DOMException('Aborted', 'AbortError')))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort)
    fetchHealth(signal).then(
      (v) => finish(() => resolve(v)),
      (e) => finish(() => reject(e)),
    )
  })
}

export type WaitForInfraOptions = {
  fetchHealth: (signal?: AbortSignal) => Promise<HealthDto>
  pollMs?: number
  timeoutMs?: number
  signal?: AbortSignal
  onProgress?: (partial: Partial<StartupProgress>) => void
}

/**
 * Poll /api/health until the API responds and database is UP or SKIPPED.
 * Marks steps via onProgress: api then postgres.
 *
 * Enforces the overall deadline even when a single fetch hangs (cold start /
 * proxy black hole) by aborting the in-flight request at the deadline.
 */
export async function waitForApiAndDatabase(
  options: WaitForInfraOptions,
): Promise<HealthDto> {
  const {
    fetchHealth,
    pollMs = STARTUP_READY_POLL_MS,
    timeoutMs = STARTUP_READY_TIMEOUT_MS,
    signal,
    onProgress,
  } = options

  const started = Date.now()
  let apiDone = false
  /** Cap a single hung fetch so cold-start can re-poll before overall deadline. */
  const perRequestMs = Math.min(45_000, timeoutMs)

  onProgress?.({
    api: 'running',
    postgres: 'pending',
    session: 'pending',
    lastError: null,
  })

  const failTimeout = (step: StartupStepKey): never => {
    onProgress?.({
      api: apiDone || step === 'postgres' ? 'done' : 'failed',
      postgres: step === 'postgres' || apiDone ? 'failed' : 'pending',
      lastError:
        step === 'api'
          ? 'Backend did not become reachable in time (cold start or down).'
          : 'Postgres did not become ready in time.',
    })
    throw new StartupTimeoutError(step)
  }

  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    const remaining = timeoutMs - (Date.now() - started)
    if (remaining <= 0) {
      failTimeout(apiDone ? 'postgres' : 'api')
    }

    const attempt = timeoutSignal(Math.min(perRequestMs, remaining), signal)
    try {
      const health = await fetchHealthUntilAbort(fetchHealth, attempt.signal)
      attempt.clear()

      if (!apiDone) {
        apiDone = true
        onProgress?.({
          api: 'done',
          postgres: 'running',
          lastError: null,
        })
      }
      if (isDatabaseReady(health)) {
        onProgress?.({
          api: 'done',
          postgres: 'done',
          lastError: null,
        })
        return health
      }
      const extra = [
        health.postgresInitError
          ? `init: ${String(health.postgresInitError).slice(0, 120)}`
          : null,
        health.journal ? `journal=${health.journal}` : null,
        health.hasSessionFactory === false ? 'no session factory' : null,
        health.databaseUrlScheme
          ? `scheme=${health.databaseUrlScheme}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
      onProgress?.({
        api: 'done',
        postgres: 'running',
        lastError:
          (health.databaseError ||
            `Database status: ${health.database || 'unknown'}`) +
          (extra ? ` (${extra})` : ''),
      })
    } catch (e) {
      attempt.clear()
      if (isAbortError(e)) {
        // Parent abort (unmount/retry) vs per-request / overall deadline.
        if (signal?.aborted) throw e
        if (Date.now() - started >= timeoutMs) {
          failTimeout(apiDone ? 'postgres' : 'api')
        }
        // Per-request abort before overall deadline → keep polling.
      }
      const msg = e instanceof Error ? e.message : 'Health check failed'
      if (!apiDone) {
        onProgress?.({
          api: 'running',
          postgres: 'pending',
          lastError: isAbortError(e)
            ? 'Waiting for backend (request timed out, retrying)…'
            : msg,
        })
      } else {
        onProgress?.({
          api: 'done',
          postgres: 'running',
          lastError: isAbortError(e)
            ? 'Waiting for database (request timed out, retrying)…'
            : msg,
        })
      }
    }

    const sleepRemaining = timeoutMs - (Date.now() - started)
    if (sleepRemaining <= 0) {
      failTimeout(apiDone ? 'postgres' : 'api')
    }
    await sleep(Math.min(pollMs, sleepRemaining), signal)
  }
}

/** Session probe deadline after infra is ready (ms). */
export const SESSION_CHECK_TIMEOUT_MS = 30_000

/**
 * Run an async probe with a timeout (and optional parent abort).
 */
export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parent?: AbortSignal | null,
): Promise<T> {
  const attempt = timeoutSignal(timeoutMs, parent)
  try {
    const combined = anyAbortSignal([attempt.signal, parent])
    return await work(combined)
  } finally {
    attempt.clear()
  }
}

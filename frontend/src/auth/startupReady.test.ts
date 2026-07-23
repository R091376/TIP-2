import { describe, expect, it, vi } from 'vitest'
import {
  StartupTimeoutError,
  waitForApiAndDatabase,
  withTimeout,
} from './startupReady'

describe('waitForApiAndDatabase', () => {
  it('marks api then postgres done when health is ready', async () => {
    const progress: unknown[] = []
    const health = await waitForApiAndDatabase({
      fetchHealth: async () => ({ status: 'UP', database: 'UP' }),
      pollMs: 10,
      timeoutMs: 1000,
      onProgress: (p) => progress.push({ ...p }),
    })
    expect(health.database).toBe('UP')
    expect(progress.some((p) => (p as { api?: string }).api === 'done')).toBe(
      true,
    )
    expect(
      progress.some((p) => (p as { postgres?: string }).postgres === 'done'),
    ).toBe(true)
  })

  it('treats SKIPPED database as ready (memory profile)', async () => {
    const health = await waitForApiAndDatabase({
      fetchHealth: async () => ({ status: 'UP', database: 'SKIPPED' }),
      pollMs: 10,
      timeoutMs: 1000,
    })
    expect(health.database).toBe('SKIPPED')
  })

  it('polls until database becomes UP', async () => {
    let n = 0
    const health = await waitForApiAndDatabase({
      fetchHealth: async () => {
        n += 1
        if (n < 3) return { status: 'UP', database: 'DOWN' }
        return { status: 'UP', database: 'UP' }
      },
      pollMs: 5,
      timeoutMs: 2000,
    })
    expect(health.database).toBe('UP')
    expect(n).toBeGreaterThanOrEqual(3)
  })

  it('times out when API never responds', async () => {
    await expect(
      waitForApiAndDatabase({
        fetchHealth: async () => {
          throw new Error('network')
        },
        pollMs: 5,
        timeoutMs: 40,
      }),
    ).rejects.toBeInstanceOf(StartupTimeoutError)
  })

  it('times out when database stays DOWN', async () => {
    await expect(
      waitForApiAndDatabase({
        fetchHealth: async () => ({ status: 'UP', database: 'DOWN' }),
        pollMs: 5,
        timeoutMs: 40,
      }),
    ).rejects.toBeInstanceOf(StartupTimeoutError)
  })

  it('times out when a single fetch hangs past the deadline', async () => {
    await expect(
      waitForApiAndDatabase({
        fetchHealth: (_signal) =>
          new Promise(() => {
            /* never resolves; must be aborted by deadline */
          }),
        pollMs: 5,
        timeoutMs: 80,
      }),
    ).rejects.toBeInstanceOf(StartupTimeoutError)
  }, 5000)

  it('aborts when parent signal aborts', async () => {
    const ac = new AbortController()
    const p = waitForApiAndDatabase({
      fetchHealth: () =>
        new Promise(() => {
          /* hang until aborted */
        }),
      pollMs: 50,
      timeoutMs: 5000,
      signal: ac.signal,
    })
    ac.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('withTimeout', () => {
  it('resolves when work finishes in time', async () => {
    const v = await withTimeout(async () => 42, 500)
    expect(v).toBe(42)
  })

  it('aborts slow work', async () => {
    await expect(
      withTimeout(
        (signal) =>
          new Promise((resolve, reject) => {
            const t = setTimeout(() => resolve('late'), 500)
            signal.addEventListener('abort', () => {
              clearTimeout(t)
              reject(new DOMException('Aborted', 'AbortError'))
            })
          }),
        30,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})

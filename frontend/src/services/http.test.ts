import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, apiAllow401 } from './http'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('api', () => {
  it('returns parsed JSON on ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ a: 1 }),
      })),
    )
    await expect(api('/api/x')).resolves.toEqual({ a: 1 })
  })

  it('maps 401 to user-facing message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => '',
      })),
    )
    await expect(api('/api/x')).rejects.toThrow(/Not signed in/i)
  })
})

describe('apiAllow401', () => {
  it('returns null on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => '',
      })),
    )
    await expect(apiAllow401('/api/auth/me')).resolves.toBeNull()
  })

  it('throws on other errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ message: 'boom' }),
      })),
    )
    await expect(apiAllow401('/api/auth/me')).rejects.toThrow(/boom/)
  })
})

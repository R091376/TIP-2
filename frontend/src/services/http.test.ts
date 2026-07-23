import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  api,
  apiAllow401,
  ApiError,
  setUnauthorizedHandler,
} from './http'

afterEach(() => {
  setUnauthorizedHandler(null)
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

  it('maps empty 401 to user-facing message', async () => {
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

  it('parses FastAPI detail string on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ detail: 'Not logged in' }),
      })),
    )
    await expect(api('/api/watchlist')).rejects.toThrow('Not logged in')
  })

  it('stringifies object detail instead of [object Object]', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ detail: { isLoggedIn: false } }),
      })),
    )
    try {
      await api('/api/watchlist')
      expect.unreachable('should throw')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as Error).message).toContain('isLoggedIn')
      expect((e as Error).message).not.toBe('[object Object]')
    }
  })

  it('notifies unauthorized handler for protected paths', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ detail: 'Not logged in' }),
      })),
    )
    await expect(api('/api/watchlist')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/api/watchlist', message: 'Not logged in' }),
    )
  })

  it('does not notify unauthorized handler for login', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ detail: 'Invalid username or password' }),
      })),
    )
    await expect(api('/api/auth/login', { method: 'POST', body: '{}' })).rejects.toThrow(
      /Invalid username/,
    )
    expect(handler).not.toHaveBeenCalled()
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

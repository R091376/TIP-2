/**
 * Shared fetch helper for TIP API (session cookies + JSON errors).
 */

import { apiUrl } from '../config'

export type ApiOptions = RequestInit & {
  /** When true (default), send session cookie. */
  credentials?: RequestCredentials
}

export class ApiError extends Error {
  status: number
  path: string

  constructor(message: string, status: number, path: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.path = path
  }
}

/** Called when a non-login request gets 401 (session missing/expired). */
type UnauthorizedHandler = (info: { path: string; message: string }) => void
let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

export function isUnauthorizedError(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 401
  if (err instanceof Error) {
    // Status-based is preferred; message match is a fallback for non-ApiError throws.
    // Do not match "session cookie" — that is a login-config error, not a mid-app 401.
    return /not signed in|not logged in|please log in again/i.test(err.message)
  }
  return false
}

function coerceServerMessage(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const t = value.trim()
    return t || null
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    // FastAPI validation errors: [{loc, msg, type}, ...]
    const parts = value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg)
        }
        return null
      })
      .filter(Boolean)
    return parts.length ? parts.join('; ') : null
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    const nested =
      coerceServerMessage(o.message) ||
      coerceServerMessage(o.error) ||
      coerceServerMessage(o.detail) ||
      coerceServerMessage(o.title)
    if (nested) return nested
    // Avoid React "object as child" / "[object Object]" banners
    try {
      return JSON.stringify(o)
    } catch {
      return null
    }
  }
  return null
}

function messageFromBody(status: number, body: string): string {
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = body ? (JSON.parse(body) as Record<string, unknown>) : null
  } catch {
    parsed = null
  }

  const serverMsg =
    coerceServerMessage(parsed?.message) ||
    coerceServerMessage(parsed?.error) ||
    coerceServerMessage(parsed?.detail) ||
    (parsed == null && body ? body.trim() : null)

  if (status === 503) {
    return serverMsg || 'Service temporarily unavailable.'
  }
  if (status === 400) {
    return serverMsg || 'Invalid request.'
  }
  if (status === 404) {
    return serverMsg || 'Not found.'
  }
  if (status === 409) {
    return serverMsg || 'Conflict.'
  }
  if (status === 401) {
    return serverMsg || 'Not signed in. Please log in again.'
  }
  if (status === 403) {
    return serverMsg || 'You do not have permission for this action.'
  }
  if (status >= 500) {
    return serverMsg || 'Backend error. Make sure the server is running on port 8080.'
  }
  return serverMsg || `Request failed (${status})`
}

function shouldNotifyUnauthorized(path: string): boolean {
  // Login/logout failures are expected UX, not a dropped session mid-app.
  const p = path.split('?')[0]
  if (p.endsWith('/api/auth/login')) return false
  if (p.endsWith('/api/auth/logout')) return false
  if (p.endsWith('/api/auth/me')) return false
  if (p.endsWith('/api/health')) return false
  return true
}

/**
 * Fetch JSON from the API. Throws Error with a user-facing message on non-OK.
 * Returns null for 204 / empty body.
 */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (options.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }

  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: options.credentials ?? 'include',
    headers,
  })

  if (!response.ok) {
    const text = await response.text()
    const message = messageFromBody(response.status, text)
    if (response.status === 401 && shouldNotifyUnauthorized(path)) {
      try {
        unauthorizedHandler?.({ path, message })
      } catch {
        /* ignore handler errors */
      }
    }
    throw new ApiError(message, response.status, path)
  }

  if (response.status === 204) {
    return null as T
  }

  const text = await response.text()
  if (!text) {
    return null as T
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Invalid JSON from server')
  }
}

/** Session probe: 401 → null; other errors throw. */
export async function apiAllow401<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T | null> {
  const headers = new Headers(options.headers || {})
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')

  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: options.credentials ?? 'include',
    headers,
  })

  if (response.status === 401) {
    return null
  }
  if (!response.ok) {
    const text = await response.text()
    throw new ApiError(messageFromBody(response.status, text), response.status, path)
  }
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  return JSON.parse(text) as T
}

/**
 * Shared fetch helper for TIP API (Bearer JWT + JSON errors).
 */

import { clearAccessToken, getAccessToken } from '../auth/tokenStorage'
import { apiUrl } from '../config'

export type ApiOptions = RequestInit & {
  /** When true (default), attach Authorization Bearer if a token is stored. */
  auth?: boolean
}

export class ApiError extends Error {
  status: number
  path: string
  /** Optional machine-readable code from FastAPI-style `{ detail: { code, message } }`. */
  code?: string

  constructor(message: string, status: number, path: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.path = path
    if (code != null && String(code).trim() !== '') {
      this.code = String(code).trim()
    }
  }
}

/** Called when a non-login request gets 401 (token missing/expired). */
type UnauthorizedHandler = (info: { path: string; message: string }) => void
let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

export function isUnauthorizedError(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 401
  if (err instanceof Error) {
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
    try {
      return JSON.stringify(o)
    } catch {
      return null
    }
  }
  return null
}

const STATUS_FALLBACK: Record<number, string> = {
  400: 'Invalid request.',
  401: 'Not signed in. Please log in again.',
  403: 'You do not have permission for this action.',
  404: 'Not found.',
  409: 'Conflict.',
  503: 'Service temporarily unavailable.',
}

/** Pull optional `code` from top-level or FastAPI `detail: { code, message }`. */
function extractErrorCode(parsed: Record<string, unknown> | null): string | undefined {
  if (!parsed) return undefined
  if (typeof parsed.code === 'string' && parsed.code.trim()) {
    return parsed.code.trim()
  }
  const detail = parsed.detail
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>
    if (typeof d.code === 'string' && d.code.trim()) {
      return d.code.trim()
    }
  }
  return undefined
}

function errorFromBody(
  status: number,
  body: string,
): { message: string; code?: string } {
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

  const code = extractErrorCode(parsed)

  if (serverMsg) return { message: serverMsg, code }
  if (STATUS_FALLBACK[status]) return { message: STATUS_FALLBACK[status], code }
  if (status >= 500) {
    return {
      message: 'Backend error. Make sure the server is running on port 8080.',
      code,
    }
  }
  return { message: `Request failed (${status})`, code }
}

const NO_UNAUTHORIZED_NOTIFY = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/health',
])

function shouldNotifyUnauthorized(path: string): boolean {
  const p = path.split('?')[0]
  return !NO_UNAUTHORIZED_NOTIFY.has(p)
}

function buildHeaders(options: ApiOptions): Headers {
  const headers = new Headers(options.headers || {})
  if (options.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }
  const useAuth = options.auth !== false
  if (useAuth && !headers.has('Authorization')) {
    const token = getAccessToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }
  return headers
}

async function parseJsonBody<T>(response: Response): Promise<T | null> {
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('Invalid JSON from server')
  }
}

/**
 * Fetch JSON from the API. Throws Error with a user-facing message on non-OK.
 * Returns null for 204 / empty body.
 */
export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: 'omit',
    headers: buildHeaders(options),
  })

  if (!response.ok) {
    const text = await response.text()
    const { message, code } = errorFromBody(response.status, text)
    if (response.status === 401 && shouldNotifyUnauthorized(path)) {
      clearAccessToken()
      try {
        unauthorizedHandler?.({ path, message })
      } catch {
        /* ignore handler errors */
      }
    }
    throw new ApiError(message, response.status, path, code)
  }

  return (await parseJsonBody<T>(response)) as T
}

/** Auth probe: 401 → null; other errors throw. */
export async function apiAllow401<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T | null> {
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: 'omit',
    headers: buildHeaders(options),
  })

  if (response.status === 401) {
    // Drop expired/invalid token so the next login does not send a stale Bearer.
    clearAccessToken()
    return null
  }
  if (!response.ok) {
    const text = await response.text()
    const { message, code } = errorFromBody(response.status, text)
    throw new ApiError(message, response.status, path, code)
  }
  return parseJsonBody<T>(response)
}

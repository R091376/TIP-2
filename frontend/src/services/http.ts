/**
 * Shared fetch helper for TIP API (session cookies + JSON errors).
 */

export type ApiOptions = RequestInit & {
  /** When true (default), send session cookie. */
  credentials?: RequestCredentials
}

function messageFromBody(status: number, body: string): string {
  let parsed: { message?: string; error?: string } | null = null
  try {
    parsed = body ? (JSON.parse(body) as { message?: string; error?: string }) : null
  } catch {
    parsed = null
  }
  const serverMsg = parsed?.message || parsed?.error || body

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

  const response = await fetch(path, {
    ...options,
    credentials: options.credentials ?? 'include',
    headers,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(messageFromBody(response.status, text))
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

  const response = await fetch(path, {
    ...options,
    credentials: options.credentials ?? 'include',
    headers,
  })

  if (response.status === 401) {
    return null
  }
  if (!response.ok) {
    const text = await response.text()
    throw new Error(messageFromBody(response.status, text))
  }
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  return JSON.parse(text) as T
}

/**
 * Runtime API targeting for local (Vite proxy) vs split deploy (Render).
 *
 * VITE_API_BASE_URL — full origin of the FastAPI service, no trailing slash.
 *   Local: leave unset → relative /api and same-host /ws (Vite proxies to :8080)
 *   Render: https://tip2-api.onrender.com
 */

function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

/** Empty string means same-origin / Vite proxy. */
export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  return trimTrailingSlash(raw.trim())
}

/** Absolute or relative URL for HTTP API paths (always starts with /api/...). */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = getApiBaseUrl()
  return base ? `${base}${p}` : p
}

/**
 * WebSocket URL for live candles.
 * Uses VITE_API_BASE_URL host when set; otherwise current page host (local proxy).
 */
export function wsUrl(path = '/ws/live'): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = getApiBaseUrl()
  if (base) {
    const u = new URL(base)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = p
    u.search = ''
    u.hash = ''
    return u.toString()
  }
  if (typeof window === 'undefined') {
    return `ws://localhost${p}`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${p}`
}

import { api, apiAllow401 } from './http'

export type UserDto = {
  id: string
  username: string
  displayName?: string | null
  role: string
  cashBalance?: number | string
  tradingEnabled?: boolean
  active?: boolean
  createdAt?: string
  updatedAt?: string
}

/**
 * Login + verify the session cookie is actually stored and sent.
 *
 * On split deploy (FE and API on different hosts), login can return 200 and a user
 * body while the browser rejects Set-Cookie (missing SameSite=None / Secure / CORS).
 * Without verification the UI would navigate to the chart, then every API call 401s.
 */
export async function login(
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<UserDto> {
  const user = await api<UserDto>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    signal,
  })
  if (!user || !user.username) {
    throw new Error('Login succeeded but user payload was empty')
  }

  const me = await apiAllow401<UserDto>('/api/auth/me', { signal })
  if (!me || !me.username) {
    throw new Error(
      'Login succeeded but the session cookie was not kept by the browser. ' +
        'On Render, set SESSION_COOKIE_SAMESITE=none, SESSION_COOKIE_HTTPS_ONLY=true, ' +
        'and CORS_ALLOWED_ORIGINS to the exact frontend origin (no trailing slash).',
    )
  }
  return me
}

export async function logout(): Promise<{ status?: string } | null> {
  return api('/api/auth/logout', { method: 'POST' })
}

export async function fetchMe(signal?: AbortSignal): Promise<UserDto | null> {
  return apiAllow401<UserDto>('/api/auth/me', { signal })
}

import { clearAccessToken, setAccessToken } from '../auth/tokenStorage'
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

export type LoginResponse = {
  accessToken: string
  tokenType?: string
  expiresIn?: number
  user: UserDto
}

/**
 * Login → store JWT → verify with /api/auth/me.
 */
export async function login(
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<UserDto> {
  const body = await api<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    signal,
    auth: false,
  })
  if (!body?.accessToken) {
    throw new Error('Login succeeded but access token was missing')
  }
  if (!body.user?.username) {
    throw new Error('Login succeeded but user payload was empty')
  }
  setAccessToken(body.accessToken)

  const me = await apiAllow401<UserDto>('/api/auth/me', { signal })
  if (!me || !me.username) {
    clearAccessToken()
    throw new Error(
      'Login succeeded but the access token was not accepted. Try again or check JWT_SECRET on the API.',
    )
  }
  return me
}

export async function logout(): Promise<{ status?: string } | null> {
  try {
    return await api('/api/auth/logout', { method: 'POST', auth: false })
  } finally {
    clearAccessToken()
  }
}

export async function fetchMe(signal?: AbortSignal): Promise<UserDto | null> {
  return apiAllow401<UserDto>('/api/auth/me', { signal })
}

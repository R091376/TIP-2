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

export async function login(username: string, password: string): Promise<UserDto> {
  const user = await api<UserDto>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (!user || !user.username) {
    throw new Error('Login succeeded but user payload was empty')
  }
  return user
}

export async function logout(): Promise<{ status?: string } | null> {
  return api('/api/auth/logout', { method: 'POST' })
}

export async function fetchMe(): Promise<UserDto | null> {
  return apiAllow401<UserDto>('/api/auth/me')
}

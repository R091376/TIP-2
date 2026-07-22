import { api } from './http'
import type { UserDto } from './authApi'

export async function listUsers(): Promise<UserDto[]> {
  const data = await api<UserDto[]>('/api/admin/users')
  return Array.isArray(data) ? data : []
}

export function createUser(body: {
  username: string
  password: string
  displayName?: string | null
  role?: string
  seedCash?: number | null
}): Promise<UserDto> {
  return api<UserDto>('/api/admin/users', { method: 'POST', body: JSON.stringify(body) })
}

export function updateUser(
  id: string,
  body: {
    displayName?: string | null
    role?: string
    tradingEnabled?: boolean
    active?: boolean
  },
): Promise<UserDto> {
  return api<UserDto>(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) })
}

export function setPassword(id: string, password: string): Promise<{ status?: string } | null> {
  return api(`/api/admin/users/${id}/password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export function seedCash(id: string, amount: number): Promise<UserDto> {
  return api<UserDto>(`/api/admin/users/${id}/seed-cash`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  })
}

export function resetAccount(id: string, amount?: number): Promise<UserDto> {
  if (amount == null) {
    return api<UserDto>(`/api/admin/users/${id}/reset`, { method: 'POST' })
  }
  return api<UserDto>(`/api/admin/users/${id}/reset`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  })
}

export function setTradingEnabled(id: string, enabled: boolean): Promise<UserDto> {
  return api<UserDto>(`/api/admin/users/${id}/trading`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  })
}

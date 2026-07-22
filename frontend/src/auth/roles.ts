/** Normalize backend role strings (ADMIN, ROLE_ADMIN, etc.). */
export function normalizeRole(role: unknown): string {
  if (role == null) return ''
  return String(role).trim().toUpperCase().replace(/^ROLE_/, '')
}

export function isAdminRole(role: unknown): boolean {
  return normalizeRole(role) === 'ADMIN'
}

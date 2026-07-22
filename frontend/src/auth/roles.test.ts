import { describe, expect, it } from 'vitest'
import { isAdminRole, normalizeRole } from './roles'

describe('normalizeRole', () => {
  it('uppercases and strips ROLE_ prefix', () => {
    expect(normalizeRole('admin')).toBe('ADMIN')
    expect(normalizeRole('ROLE_ADMIN')).toBe('ADMIN')
    expect(normalizeRole(' role_user ')).toBe('USER')
  })

  it('returns empty for nullish', () => {
    expect(normalizeRole(null)).toBe('')
    expect(normalizeRole(undefined)).toBe('')
  })
})

describe('isAdminRole', () => {
  it('accepts ADMIN variants', () => {
    expect(isAdminRole('ADMIN')).toBe(true)
    expect(isAdminRole('ROLE_ADMIN')).toBe(true)
    expect(isAdminRole('admin')).toBe(true)
  })

  it('rejects non-admin', () => {
    expect(isAdminRole('USER')).toBe(false)
    expect(isAdminRole('ROLE_USER')).toBe(false)
    expect(isAdminRole(null)).toBe(false)
  })
})

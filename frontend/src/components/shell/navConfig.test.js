import { afterEach, describe, expect, it, vi } from 'vitest'

describe('navConfig learn / admin active split', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('includes Learn for all roles when flag on; Admin only for admins', async () => {
    vi.stubEnv('VITE_FEATURE_ADMIN_LEARN', 'true')
    const { getNavItems, isNavItemActive } = await import('./navConfig.js')
    const adminItems = getNavItems({ isAdmin: true })
    expect(adminItems.some((i) => i.id === 'learn')).toBe(true)
    expect(adminItems.some((i) => i.id === 'admin')).toBe(true)

    const userItems = getNavItems({ isAdmin: false })
    expect(userItems.some((i) => i.id === 'learn')).toBe(true)
    expect(userItems.some((i) => i.id === 'admin')).toBe(false)

    expect(isNavItemActive('admin', { pathname: '/admin/users' })).toBe(true)
    expect(isNavItemActive('admin', { pathname: '/learn' })).toBe(false)
    expect(isNavItemActive('learn', { pathname: '/learn' })).toBe(true)
    expect(isNavItemActive('learn', { pathname: '/learn/patterns/breakout' })).toBe(true)
    expect(isNavItemActive('learn', { pathname: '/admin/users' })).toBe(false)
  })

  it('omits Learn when flag off', async () => {
    vi.stubEnv('VITE_FEATURE_ADMIN_LEARN', 'false')
    const { getNavItems } = await import('./navConfig.js')
    const items = getNavItems({ isAdmin: true })
    expect(items.some((i) => i.id === 'admin')).toBe(true)
    expect(items.some((i) => i.id === 'learn')).toBe(false)
  })
})

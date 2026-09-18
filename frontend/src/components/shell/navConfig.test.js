import { afterEach, describe, expect, it, vi } from 'vitest'

describe('navConfig learn / admin active split', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('includes Learn for all roles when flag on; Admin only for admins', async () => {
    vi.stubEnv('VITE_FEATURE_ADMIN_LEARN', 'true')
    const { getNavItems, isNavItemActive } = await import('./navConfig.js')
    const adminItems = getNavItems({ isAdmin: true, isAuthenticated: true })
    expect(adminItems.some((i) => i.id === 'learn')).toBe(true)
    expect(adminItems.some((i) => i.id === 'admin')).toBe(true)

    const userItems = getNavItems({ isAdmin: false, isAuthenticated: true })
    expect(userItems.some((i) => i.id === 'learn')).toBe(true)
    expect(userItems.some((i) => i.id === 'admin')).toBe(false)
    expect(userItems.some((i) => i.id === 'backtest')).toBe(false)

    expect(isNavItemActive('admin', { pathname: '/admin/users' })).toBe(true)
    expect(isNavItemActive('admin', { pathname: '/learn' })).toBe(false)
    expect(isNavItemActive('learn', { pathname: '/learn' })).toBe(true)
    expect(isNavItemActive('learn', { pathname: '/learn/patterns/breakout' })).toBe(true)
    expect(isNavItemActive('learn', { pathname: '/learn/concepts/woodie-sr' })).toBe(true)
    expect(isNavItemActive('learn', { pathname: '/admin/users' })).toBe(false)
  })

  it('omits Learn when flag off', async () => {
    vi.stubEnv('VITE_FEATURE_ADMIN_LEARN', 'false')
    const { getNavItems } = await import('./navConfig.js')
    const items = getNavItems({ isAdmin: true, isAuthenticated: true })
    expect(items.some((i) => i.id === 'admin')).toBe(true)
    expect(items.some((i) => i.id === 'learn')).toBe(false)
  })

  it('guest mobile five is Stats, Charts, Watchlist, Alerts, Learn', async () => {
    vi.stubEnv('VITE_FEATURE_ADMIN_LEARN', 'true')
    const { getNavItems } = await import('./navConfig.js')
    const ids = getNavItems({ isAuthenticated: false }).map((i) => i.id)
    expect(ids).toEqual(['dashboard', 'charts', 'watchlist', 'alerts', 'learn'])
    expect(ids.slice(0, 5)).toEqual(['dashboard', 'charts', 'watchlist', 'alerts', 'learn'])
  })

  it('authenticated non-admin first five stays Stats, Charts, Watchlist, Orders, Positions', async () => {
    vi.stubEnv('VITE_FEATURE_ADMIN_LEARN', 'true')
    const { getNavItems } = await import('./navConfig.js')
    const ids = getNavItems({ isAuthenticated: true, isAdmin: false }).map((i) => i.id)
    expect(ids.slice(0, 5)).toEqual([
      'dashboard',
      'charts',
      'watchlist',
      'orders',
      'positions',
    ])
    expect(ids).toContain('alerts')
    expect(ids).toContain('learn')
  })

  it('admin adds admin after Learn; first five unchanged', async () => {
    vi.stubEnv('VITE_FEATURE_ADMIN_LEARN', 'true')
    const { getNavItems, isNavItemActive } = await import('./navConfig.js')
    const ids = getNavItems({ isAuthenticated: true, isAdmin: true }).map((i) => i.id)
    expect(ids.slice(0, 5)).toEqual([
      'dashboard',
      'charts',
      'watchlist',
      'orders',
      'positions',
    ])
    expect(ids[ids.length - 1]).toBe('admin')
    expect(ids).toContain('learn')
    expect(ids).toContain('backtest')
    expect(isNavItemActive('backtest', { pathname: '/backtest' })).toBe(true)
    expect(isNavItemActive('admin', { pathname: '/backtest' })).toBe(false)
  })
})

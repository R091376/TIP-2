/**
 * App sidebar navigation config (mock → product mapping).
 */

import { isAdminLearnEnabled } from '../../config/featureFlags'

/** @typedef {'dashboard'|'charts'|'watchlist'|'orders'|'positions'|'alerts'|'admin'|'learn'} NavId */

/**
 * @param {{ isAdmin?: boolean }} opts
 * @returns {Array<{ id: NavId, label: string, to: string, panel?: 'watchlist'|'alerts', icon: string, adminOnly?: boolean }>}
 */
export function getNavItems({ isAdmin = false } = {}) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', to: '/patterns/stats', icon: 'dashboard' },
    { id: 'charts', label: 'Charts', to: '/', icon: 'charts' },
    { id: 'watchlist', label: 'Watchlist', to: '/?panel=watchlist', panel: 'watchlist', icon: 'watchlist' },
    { id: 'orders', label: 'Orders', to: '/paper/orders', icon: 'orders' },
    { id: 'positions', label: 'Positions', to: '/paper', icon: 'positions' },
    { id: 'alerts', label: 'Alerts', to: '/?panel=alerts', panel: 'alerts', icon: 'alerts' },
  ]
  if (isAdmin) {
    items.push({ id: 'admin', label: 'Admin', to: '/admin/users', icon: 'admin', adminOnly: true })
    if (isAdminLearnEnabled()) {
      items.push({ id: 'learn', label: 'Learn', to: '/learn', icon: 'learn', adminOnly: true })
    }
  }
  return items
}

/**
 * Active nav rules after panel strip (Charts active when path is /).
 * @param {NavId} id
 * @param {{ pathname: string, search?: string }} loc
 */
export function isNavItemActive(id, loc) {
  const path = loc.pathname || '/'
  const params = new URLSearchParams(loc.search || '')
  const panel = params.get('panel')

  if (id === 'watchlist') return path === '/' && panel === 'watchlist'
  if (id === 'alerts') return path === '/' && panel === 'alerts'
  if (id === 'charts') return path === '/' && panel !== 'watchlist' && panel !== 'alerts'
  if (id === 'positions') return path === '/paper' || path === '/paper/'
  if (id === 'orders') return path.startsWith('/paper/orders')
  if (id === 'dashboard') return path.startsWith('/patterns/stats')
  if (id === 'learn') return path === '/learn' || path.startsWith('/learn/')
  if (id === 'admin') return path.startsWith('/admin')
  return false
}

/**
 * Build Watchlist/Alerts target preserving symbol/tf when already on chart.
 * @param {'watchlist'|'alerts'} panel
 * @param {string} [currentSearch]
 */
export function buildPanelHref(panel, currentSearch = '') {
  const params = new URLSearchParams(currentSearch || '')
  params.set('panel', panel)
  const q = params.toString()
  return q ? `/?${q}` : `/?panel=${panel}`
}

import { useCallback, useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { isPrivatePath } from '../../auth/paths'
import StartupStatus from '../../auth/StartupStatus'
import { ToastProvider } from '../../hooks/useToasts'
import { getNavItems, isNavItemActive } from './navConfig'
import NavIcon from './NavIcon'
import AppMain from './AppMain'
import AppSidebar from './AppSidebar'
import '../../pages/authPages.css'
import './shell.css'

const LS_EXPANDED = 'tip.shell.sidebarExpanded'

function readExpandedDefault() {
  try {
    const v = localStorage.getItem(LS_EXPANDED)
    if (v === '0' || v === 'false') return false
    if (v === '1' || v === 'true') return true
  } catch {
    /* ignore */
  }
  // Prefer expanded on wide desktops
  if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1100px)').matches) {
    return true
  }
  return false
}

/**
 * Public app chrome: left sidebar + main outlet. Private pages nest RequireAuth.
 */
export default function AppShell() {
  const { user, isAdmin, logout, loading, blocking, startup } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(readExpandedDefault)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const mobileNav = getNavItems({
    isAdmin,
    isAuthenticated: Boolean(user),
  }).filter((n) => !n.adminOnly || isAdmin)

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev
      try {
        localStorage.setItem(LS_EXPANDED, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const openDrawer = useCallback(() => setDrawerOpen(true), [])

  const handleLogout = useCallback(async () => {
    if (isPrivatePath(location.pathname)) {
      navigate('/', { replace: true })
    }
    await logout?.()
  }, [location.pathname, logout, navigate])

  useEffect(() => {
    if (!drawerOpen) return undefined
    function onKey(e) {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  // Close drawer when resizing to desktop
  useEffect(() => {
    function onResize() {
      if (window.matchMedia('(min-width: 900px)').matches) {
        setDrawerOpen(false)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Pin the document while the shell is mounted so mobile browsers cannot
  // rubber-band / micro-scroll under the fixed chrome (URL bar height drift).
  // CSS (html.app-shell-active) locks body; shell is sized to --app-vh.
  useEffect(() => {
    const root = document.documentElement
    const scrollY = window.scrollY
    root.classList.add('app-shell-active')
    // Ensure we start at the top of the visual frame (no residual document scroll).
    window.scrollTo(0, 0)
    return () => {
      root.classList.remove('app-shell-active')
      window.scrollTo(0, scrollY)
    }
  }, [])

  if (blocking || loading) {
    if (startup?.enabled && blocking) {
      return (
        <StartupStatus
          steps={startup.steps}
          lastError={startup.lastError}
          timedOut={startup.timedOut}
          onRetry={startup.retry}
        />
      )
    }
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-card__hint">Checking session…</p>
        </div>
      </div>
    )
  }

  return (
    <ToastProvider>
      <div
        className={`app-shell${drawerOpen ? ' app-shell--drawer-open' : ''} app-shell--with-mobile-nav`}
      >
        <button
          type="button"
          className="app-shell__backdrop"
          aria-label="Close navigation"
          tabIndex={drawerOpen ? 0 : -1}
          onClick={closeDrawer}
        />
        <AppSidebar
          user={user}
          isAdmin={isAdmin}
          onLogout={handleLogout}
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
          drawerOpen={drawerOpen}
          onNavigate={closeDrawer}
        />
        {/*
          Column owns main + bottom nav so the nav is in-flow (not position:fixed).
          Fixed bottom bars often misalign with visualViewport on mobile browsers.
        */}
        <div className="app-shell__column">
          <AppMain drawerOpen={drawerOpen} onOpenDrawer={openDrawer} />
          <nav className="app-mobile-bottom-nav" aria-label="Primary">
            {mobileNav.slice(0, 5).map((item) => {
              const active = isNavItemActive(item.id, location)
              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  className={`app-mobile-bottom-nav__item${active ? ' is-active' : ''}`}
                  end={item.to === '/'}
                >
                  <NavIcon name={item.icon} className="app-mobile-bottom-nav__icon" />
                  <span className="app-mobile-bottom-nav__label">{item.label}</span>
                </NavLink>
              )
            })}
          </nav>
        </div>
      </div>
    </ToastProvider>
  )
}

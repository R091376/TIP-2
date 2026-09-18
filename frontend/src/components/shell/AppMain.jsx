import { Outlet, useLocation } from 'react-router-dom'

function pageTitle(pathname) {
  if (pathname.startsWith('/paper/orders')) return 'Orders'
  if (pathname === '/paper' || pathname === '/paper/') return 'Positions'
  if (pathname.startsWith('/patterns/stats')) return 'Stats'
  if (pathname === '/learn' || pathname.startsWith('/learn/')) return 'Learn'
  if (pathname.startsWith('/backtest')) return 'Backtest'
  if (pathname.startsWith('/admin')) return 'Admin'
  return 'Charts'
}

/**
 * Main content region — fill height for chart, scrollable padding for desk pages.
 * Mobile-only top bar (hamburger + title). Login lives in the sidebar footer.
 */
export default function AppMain({ drawerOpen, onOpenDrawer }) {
  const location = useLocation()
  const isChart = location.pathname === '/'
  const title = pageTitle(location.pathname)

  return (
    <div className={`app-main${isChart ? ' app-main--chart' : ' app-main--desk'}`}>
      <div className="app-main__mobile-bar">
        <button
          type="button"
          className="app-main__menu-btn"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          onClick={onOpenDrawer}
        >
          ☰
        </button>
        <span className="app-main__mobile-title">{title}</span>
      </div>
      <div className="app-main__outlet">
        <Outlet />
      </div>
    </div>
  )
}

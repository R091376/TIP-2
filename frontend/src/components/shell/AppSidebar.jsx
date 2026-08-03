import { Link, useLocation, useNavigate } from 'react-router-dom'
import UserAccountMenu from '../UserAccountMenu'
import NavIcon from './NavIcon'
import { buildPanelHref, getNavItems, isNavItemActive } from './navConfig'

/**
 * Left app navigation matching broker-style mock.
 */
export default function AppSidebar({
  user,
  isAdmin,
  onLogout,
  expanded,
  onToggleExpanded,
  drawerOpen,
  onNavigate,
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const items = getNavItems({ isAdmin })

  function handleNavClick(e, item) {
    if (item.panel) {
      e.preventDefault()
      const href = buildPanelHref(item.panel, location.pathname === '/' ? location.search : '')
      navigate(href)
    }
    onNavigate?.()
  }

  return (
    <aside
      className={`app-sidebar${expanded ? ' app-sidebar--force-expanded' : ' app-sidebar--collapsed'}`}
      aria-label="Main navigation"
      data-drawer-open={drawerOpen ? 'true' : 'false'}
    >
      <Link to="/" className="app-sidebar__brand" onClick={() => onNavigate?.()}>
        <img src="/favicon.svg" alt="" className="app-sidebar__logo" width={32} height={32} />
        <span className="app-sidebar__brand-text">TIP</span>
      </Link>

      <nav className="app-sidebar__nav">
        {items.map((item) => {
          const active = isNavItemActive(item.id, location)
          const href =
            item.panel && location.pathname === '/'
              ? buildPanelHref(item.panel, location.search)
              : item.to
          return (
            <Link
              key={item.id}
              to={href}
              className={`app-sidebar__link${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              onClick={(e) => handleNavClick(e, item)}
            >
              <NavIcon name={item.icon} />
              <span className="app-sidebar__link-label">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="app-sidebar__footer">
        <button
          type="button"
          className="app-sidebar__toggle"
          onClick={onToggleExpanded}
          aria-pressed={expanded}
          title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {expanded ? '«' : '»'}
        </button>
        <UserAccountMenu user={user} onLogout={onLogout} placement="top" />
      </div>
    </aside>
  )
}

import { Link, NavLink } from 'react-router-dom'
import UserAccountMenu from './UserAccountMenu'
import '../styles/userAccount.css'

/**
 * Shared header for paper desk + orders pages.
 */
export default function PaperPageChrome({
  user,
  isAdmin,
  onLogout,
  title,
  subtitle,
  badge = 'PAPER',
}) {
  return (
    <header className="paper-page__header">
      <div>
        {badge ? <p className="paper-badge">{badge}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="paper-page__sub">{subtitle}</p> : null}
      </div>
      <nav className="paper-page__nav" aria-label="Paper navigation">
        <Link to="/" className="paper-page__nav-link">
          Chart
        </Link>
        <NavLink
          to="/paper"
          end
          className={({ isActive }) =>
            `paper-page__nav-link${isActive ? ' is-active' : ''}`
          }
        >
          Positions
        </NavLink>
        <NavLink
          to="/paper/orders"
          className={({ isActive }) =>
            `paper-page__nav-link${isActive ? ' is-active' : ''}`
          }
        >
          Orders
        </NavLink>
        <Link to="/patterns/stats" className="paper-page__nav-link">
          Stats
        </Link>
        {isAdmin ? (
          <Link to="/admin/users" className="paper-page__nav-link paper-page__nav-link--admin">
            Admin
          </Link>
        ) : null}
        <UserAccountMenu user={user} onLogout={onLogout} />
      </nav>
    </header>
  )
}

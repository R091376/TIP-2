import { Link, Outlet } from 'react-router-dom'
import { LEARN_INDEX_PATH } from '../../learn/routing'
import '../../pages/authPages.css'
import '../../pages/adminLearn.css'
import './publicLearnShell.css'

/**
 * Minimal chrome for unauthenticated Learn visitors (and AI browser tools).
 * No trading shell, no live feed, no API-backed panels — static education only.
 */
export default function PublicLearnShell() {
  return (
    <div className="public-learn">
      <header className="public-learn__header">
        <Link to={LEARN_INDEX_PATH} className="public-learn__brand">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>TIP Learn</span>
        </Link>
        <nav className="public-learn__nav" aria-label="Public">
          <Link to={LEARN_INDEX_PATH} className="public-learn__nav-link">
            Topics
          </Link>
          <Link to="/login" className="public-learn__nav-cta">
            Log in
          </Link>
        </nav>
      </header>
      <main className="public-learn__main">
        <Outlet />
      </main>
      <footer className="public-learn__footer">
        Educational content for TIP pattern and indicator calculations. Not brokerage advice.
        Shareable URL — works without an account.
        {' · '}
        <a href="/learn-export/ALL.md">AI Markdown export (ALL.md)</a>
      </footer>
    </div>
  )
}

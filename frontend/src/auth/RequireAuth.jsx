import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'
import '../pages/authPages.css'

export default function RequireAuth({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-card__hint">Checking session…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (adminOnly && !isAdmin) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-card__title">Admin only</h1>
          <p className="auth-card__hint">
            Signed in as <strong>{user.username}</strong> ({String(user.role || 'USER')}).
            This page requires an ADMIN account.
          </p>
          <Link to="/" className="auth-submit" style={{ textAlign: 'center', textDecoration: 'none' }}>
            Back to chart
          </Link>
        </div>
      </div>
    )
  }

  return children
}

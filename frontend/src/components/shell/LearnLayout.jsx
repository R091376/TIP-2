import { Navigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import StartupStatus from '../../auth/StartupStatus'
import { isAdminLearnEnabled } from '../../config/featureFlags'
import ErrorBoundary from '../ErrorBoundary'
import AppShell from './AppShell'
import PublicLearnShell from './PublicLearnShell'
import '../../pages/authPages.css'

/**
 * Learn is public: guests get PublicLearnShell; signed-in users get AppShell.
 * Both shells render <Outlet /> for /learn and /learn/:kind/:slug.
 * Feature flag can still disable the surface.
 */
export default function LearnLayout() {
  const { user, loading, blocking, startup } = useAuth()

  if (!isAdminLearnEnabled()) {
    return <Navigate to={user ? '/' : '/login'} replace />
  }

  // Same readiness gate as login when enabled (API/DB up). Content is static FE,
  // but AuthProvider still runs bootstrap under the app root.
  if (blocking && startup?.enabled) {
    return (
      <StartupStatus
        steps={startup.steps}
        lastError={startup.lastError}
        timedOut={startup.timedOut}
        onRetry={startup.retry}
      />
    )
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <p className="auth-card__hint">Loading…</p>
        </div>
      </div>
    )
  }

  return <ErrorBoundary>{user ? <AppShell /> : <PublicLearnShell />}</ErrorBoundary>
}

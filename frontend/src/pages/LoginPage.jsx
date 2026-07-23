import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import StartupStatus from '../auth/StartupStatus'
import './authPages.css'

/**
 * After login always land on the chart (`/`).
 * Do not restore /admin from location.state — that caused a flash of admin then chart.
 */
export default function LoginPage() {
  const {
    user,
    loading,
    blocking,
    login,
    startup,
    error: sessionError,
    clearError,
  } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const displayError = error || sessionError

  // Feature-flagged readiness gate (API → Postgres → session) before login form.
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

  // Already signed in → chart only (never bounce through admin).
  if (!loading && user) {
    return <Navigate to="/" replace />
  }

  function dismissErrors() {
    setError(null)
    clearError?.()
  }

  async function onSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    dismissErrors()
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="auth-card__title">TIP Login</h1>
        <p className="auth-card__hint">Paper trading platform — sign in to continue.</p>

        <label className="auth-field">
          <span>Username</span>
          <input
            autoComplete="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              if (displayError) dismissErrors()
            }}
            required
            minLength={3}
          />
        </label>

        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (displayError) dismissErrors()
            }}
            required
            minLength={4}
          />
        </label>

        {displayError && (
          <div className="auth-error" role="alert">
            {displayError}
          </div>
        )}

        <button type="submit" className="auth-submit" disabled={submitting || loading}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

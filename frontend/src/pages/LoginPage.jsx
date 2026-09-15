import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { resolveLoginNext } from '../auth/paths'
import StartupStatus from '../auth/StartupStatus'
import LoginForm from '../components/shell/LoginForm'
import './authPages.css'

/**
 * Dedicated login for deep-links and private-route recovery.
 * Honor ?next= (and state.from) on both the already-signed-in branch and submit.
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
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const next = resolveLoginNext(searchParams.get('next'), location.state?.from)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const displayError = error || sessionError

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

  if (!loading && user) {
    return <Navigate to={next} replace />
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
      navigate(next, { replace: true })
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

        <LoginForm
          username={username}
          password={password}
          onUsername={(v) => {
            setUsername(v)
            if (displayError) dismissErrors()
          }}
          onPassword={(v) => {
            setPassword(v)
            if (displayError) dismissErrors()
          }}
          error={displayError}
          submitting={submitting}
          disabled={loading}
          idPrefix="page-login"
        />

        <p className="auth-card__footer-link">
          <Link to="/">Home</Link>
        </p>
      </form>
    </div>
  )
}

import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { loginUrl } from '../../auth/paths'
import UserAccountMenu from '../UserAccountMenu'
import LoginForm from './LoginForm'

/**
 * Sidebar-footer login popover, or UserAccountMenu when signed in.
 */
export default function HeaderAuthControl({ user, onLogout, compact = false, placement = 'top' }) {
  const { login, error: sessionError, clearError, loading } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const rootRef = useRef(null)
  const dialogId = useId()
  const displayError = error || sessionError

  function dismissErrors() {
    setError(null)
    clearError?.()
  }

  useEffect(() => {
    if (!open) return undefined
    function onDocPointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (user) {
    return <UserAccountMenu user={user} onLogout={onLogout} placement={placement} />
  }

  async function onSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    dismissErrors()
    try {
      await login(username.trim(), password)
      setOpen(false)
      setUsername('')
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  const next = `${location.pathname}${location.search}`
  const fullLoginHref = loginUrl(next)
  const dropUp = placement === 'top'

  return (
    <div
      ref={rootRef}
      className={`header-auth${compact ? ' header-auth--compact' : ''}${dropUp ? ' header-auth--drop-up' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="header-auth__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        aria-label="Log in"
        onClick={() => {
          setOpen((v) => !v)
          dismissErrors()
        }}
      >
        <span className="header-auth__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M10 7V5.5A2.5 2.5 0 0 1 12.5 3h6A2.5 2.5 0 0 1 21 5.5v13A2.5 2.5 0 0 1 18.5 21h-6A2.5 2.5 0 0 1 10 18.5V17" strokeLinecap="round" />
            <path d="M3 12h12M11 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="header-auth__label">Log in</span>
      </button>
      {open ? (
        <form
          id={dialogId}
          className="header-auth__popover"
          role="dialog"
          aria-label="Log in"
          onSubmit={onSubmit}
        >
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
            idPrefix="header-login"
          />
          <p className="header-auth__full-link">
            <Link to={fullLoginHref}>Full login page</Link>
          </p>
        </form>
      ) : null}
    </div>
  )
}

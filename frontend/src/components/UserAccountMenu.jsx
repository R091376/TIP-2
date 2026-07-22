import { useEffect, useId, useRef, useState } from 'react'

/**
 * Shared account chip: user icon + name; Logout drops down on hover/click.
 */
export default function UserAccountMenu({ user, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const accountRef = useRef(null)
  const closeTimerRef = useRef(null)
  const menuId = useId()

  function clearCloseTimer() {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  function openMenu() {
    clearCloseTimer()
    setMenuOpen(true)
  }

  function scheduleClose() {
    clearCloseTimer()
    // Short delay so the pointer can move from trigger → dropdown without flicker.
    closeTimerRef.current = window.setTimeout(() => {
      setMenuOpen(false)
      closeTimerRef.current = null
    }, 150)
  }

  function toggleMenu() {
    clearCloseTimer()
    setMenuOpen((v) => !v)
  }

  useEffect(() => {
    if (!menuOpen) return undefined

    function onDocPointerDown(e) {
      const el = accountRef.current
      if (el && !el.contains(e.target)) {
        setMenuOpen(false)
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  useEffect(() => () => clearCloseTimer(), [])

  const label = user?.displayName || user?.username || 'Account'

  return (
    <div
      ref={accountRef}
      className={`user-account${menuOpen ? ' is-open' : ''}`}
      title={user?.username || undefined}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="user-account__trigger"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        onClick={toggleMenu}
      >
        <span className="user-account__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="8" r="3.25" />
            <path d="M5.5 19.25c.9-3.1 3.3-4.75 6.5-4.75s5.6 1.65 6.5 4.75" strokeLinecap="round" />
          </svg>
        </span>
        <span className="user-account__name">{label}</span>
      </button>
      <div id={menuId} className="user-account__menu" role="menu" hidden={!menuOpen}>
        <div className="user-account__menu-inner">
          <button
            type="button"
            className="user-account__logout"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onLogout?.()
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}

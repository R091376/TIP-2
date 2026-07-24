import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { fetchMe, login as apiLogin, logout as apiLogout } from '../services/authApi'
import { fetchHealth } from '../services/healthApi'
import { setUnauthorizedHandler } from '../services/http'
import { clearAccessToken } from './tokenStorage'
import {
  isStartupReadyEnabled,
  STARTUP_READY_POLL_MS,
  STARTUP_READY_TIMEOUT_MS,
} from '../config/featureFlags'
import { isAbortError } from '../utils/abort'
import { isAdminRole } from './roles'
import {
  SESSION_CHECK_TIMEOUT_MS,
  StartupTimeoutError,
  waitForApiAndDatabase,
  withTimeout,
} from './startupReady'

/** @type {import('react').Context<any>} */
export const AuthContext = createContext(null)

const INITIAL_STEPS = {
  api: 'pending',
  postgres: 'pending',
  session: 'pending',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const startupEnabled = isStartupReadyEnabled()
  const [startupSteps, setStartupSteps] = useState(() =>
    startupEnabled
      ? INITIAL_STEPS
      : { api: 'done', postgres: 'done', session: 'running' },
  )
  const [startupTimedOut, setStartupTimedOut] = useState(false)
  const [startupLastError, setStartupLastError] = useState(null)
  const [startupComplete, setStartupComplete] = useState(!startupEnabled)
  /** Bumps on login/logout so stale /me responses never overwrite a fresh session. */
  const authEpochRef = useRef(0)
  /** Bumps to re-run bootstrap (Retry). */
  const [bootGen, setBootGen] = useState(0)

  const applyProgress = useCallback((partial) => {
    setStartupSteps((prev) => ({
      api: partial.api ?? prev.api,
      postgres: partial.postgres ?? prev.postgres,
      session: partial.session ?? prev.session,
    }))
    if (partial.lastError !== undefined) {
      setStartupLastError(partial.lastError)
    }
  }, [])

  const runSessionCheck = useCallback(
    async (epoch, parentSignal) => {
      applyProgress({ session: 'running', lastError: null })
      try {
        const me = await withTimeout(
          (signal) => fetchMe(signal),
          SESSION_CHECK_TIMEOUT_MS,
          parentSignal,
        )
        if (epoch !== authEpochRef.current) return null
        // fetchMe returns null on 401 — that is a normal anonymous visit.
        setUser(me)
        setError(null)
        applyProgress({ session: 'done', lastError: null })
        return me
      } catch (e) {
        if (epoch !== authEpochRef.current) return null
        if (isAbortError(e) && parentSignal?.aborted) return null

        setUser(null)
        const timedOut = isAbortError(e) && !parentSignal?.aborted
        const msg = timedOut
          ? 'Session check timed out. You can try logging in.'
          : e instanceof Error
            ? e.message
            : 'Auth failed'
        // Surface probe failures on the login page; still open the gate below.
        setError(msg)
        applyProgress({ session: 'failed', lastError: msg })
        return null
      }
    },
    [applyProgress],
  )

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    const epoch = authEpochRef.current

    setLoading(true)
    setStartupTimedOut(false)
    setStartupLastError(null)
    setStartupComplete(!startupEnabled)
    setStartupSteps(
      startupEnabled
        ? INITIAL_STEPS
        : { api: 'done', postgres: 'done', session: 'running' },
    )

    ;(async () => {
      try {
        if (startupEnabled) {
          await waitForApiAndDatabase({
            fetchHealth,
            pollMs: STARTUP_READY_POLL_MS,
            timeoutMs: STARTUP_READY_TIMEOUT_MS,
            signal: ac.signal,
            onProgress: (partial) => {
              if (!cancelled) applyProgress(partial)
            },
          })
          if (cancelled || epoch !== authEpochRef.current) return
        }

        await runSessionCheck(epoch, ac.signal)
        if (cancelled || epoch !== authEpochRef.current) return

        // Open gate even if session probe failed so login remains reachable.
        setStartupComplete(true)
        setLoading(false)
      } catch (e) {
        if (cancelled || ac.signal.aborted) return
        if (isAbortError(e)) return

        if (e instanceof StartupTimeoutError) {
          setStartupTimedOut(true)
          setStartupComplete(false)
          setLoading(true)
          return
        }

        const msg = e instanceof Error ? e.message : 'Startup failed'
        setStartupLastError(msg)
        setStartupTimedOut(true)
        setStartupComplete(false)
        setLoading(true)
      }
    })()

    return () => {
      cancelled = true
      ac.abort()
    }
  }, [startupEnabled, bootGen, applyProgress, runSessionCheck])

  const retryStartup = useCallback(() => {
    setBootGen((g) => g + 1)
  }, [])

  const refresh = useCallback(async () => {
    const epoch = authEpochRef.current
    try {
      const me = await fetchMe()
      if (epoch !== authEpochRef.current) {
        return me
      }
      setUser(me)
      setError(null)
      return me
    } catch (e) {
      if (epoch !== authEpochRef.current) {
        return null
      }
      setUser(null)
      setError(e instanceof Error ? e.message : 'Auth failed')
      return null
    } finally {
      if (epoch === authEpochRef.current) {
        setLoading(false)
      }
    }
  }, [])

  const login = useCallback(async (username, password) => {
    setError(null)
    // apiLogin stores JWT and verifies via /me.
    const me = await apiLogin(username, password)
    authEpochRef.current += 1
    setUser(me)
    setLoading(false)
    setStartupComplete(true)
    setStartupTimedOut(false)
    setStartupSteps({ api: 'done', postgres: 'done', session: 'done' })
    return me
  }, [])

  const logout = useCallback(async () => {
    authEpochRef.current += 1
    try {
      await apiLogout()
    } finally {
      clearAccessToken()
      setUser(null)
      setLoading(false)
      setError(null)
    }
  }, [])

  /** Drop client auth when a protected API returns 401 (token missing/expired). */
  const clearSession = useCallback((reason) => {
    authEpochRef.current += 1
    clearAccessToken()
    setUser(null)
    setLoading(false)
    setError(reason || 'Not signed in. Please log in again.')
  }, [])

  const clearError = useCallback(() => setError(null), [])

  useEffect(() => {
    setUnauthorizedHandler(({ message }) => {
      clearSession(message || 'Not signed in. Please log in again.')
    })
    return () => setUnauthorizedHandler(null)
  }, [clearSession])

  const isAdmin = isAdminRole(user?.role)

  const startup = useMemo(
    () => ({
      enabled: startupEnabled,
      steps: startupSteps,
      complete: startupComplete,
      timedOut: startupTimedOut,
      lastError: startupLastError,
      retry: retryStartup,
    }),
    [
      startupEnabled,
      startupSteps,
      startupComplete,
      startupTimedOut,
      startupLastError,
      retryStartup,
    ],
  )

  /**
   * Gate routes until ready:
   * - flag off → only while session probe `loading`
   * - flag on  → until infra+session complete, or stuck on timed-out Retry UI
   */
  const blocking = startupEnabled
    ? !startupComplete || startupTimedOut
    : loading

  const value = useMemo(
    () => ({
      user,
      loading,
      blocking,
      error,
      isAdmin,
      login,
      logout,
      refresh,
      clearSession,
      clearError,
      startup,
    }),
    [
      user,
      loading,
      blocking,
      error,
      isAdmin,
      login,
      logout,
      refresh,
      clearSession,
      clearError,
      startup,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

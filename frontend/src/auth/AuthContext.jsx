import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { fetchMe, login as apiLogin, logout as apiLogout } from '../services/authApi'
import { isAdminRole } from './roles'

/** @type {import('react').Context<any>} */
export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  /** Bumps on login/logout so stale /me responses never overwrite a fresh session. */
  const authEpochRef = useRef(0)

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

  useEffect(() => {
    let cancelled = false
    const epoch = authEpochRef.current
    ;(async () => {
      try {
        const me = await fetchMe()
        if (cancelled || epoch !== authEpochRef.current) return
        setUser(me)
        setError(null)
      } catch (e) {
        if (cancelled || epoch !== authEpochRef.current) return
        setUser(null)
        setError(e instanceof Error ? e.message : 'Auth failed')
      } finally {
        if (!cancelled && epoch === authEpochRef.current) {
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (username, password) => {
    setError(null)
    const me = await apiLogin(username, password)
    authEpochRef.current += 1
    setUser(me)
    setLoading(false)
    return me
  }, [])

  const logout = useCallback(async () => {
    authEpochRef.current += 1
    try {
      await apiLogout()
    } finally {
      setUser(null)
      setLoading(false)
    }
  }, [])

  const isAdmin = isAdminRole(user?.role)

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      isAdmin,
      login,
      logout,
      refresh,
    }),
    [user, loading, error, isAdmin, login, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

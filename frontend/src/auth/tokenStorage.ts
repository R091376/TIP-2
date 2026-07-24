/**
 * JWT access token in localStorage (8h server-side exp).
 * Survives tab close; cleared on logout / 401 / explicit clear.
 */

const TOKEN_KEY = 'tip_access_token'

export function getAccessToken(): string | null {
  try {
    const v = localStorage.getItem(TOKEN_KEY)
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

export function setAccessToken(token: string | null | undefined): void {
  try {
    if (token && token.trim()) {
      localStorage.setItem(TOKEN_KEY, token.trim())
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    /* private mode / blocked storage */
  }
}

export function clearAccessToken(): void {
  setAccessToken(null)
}

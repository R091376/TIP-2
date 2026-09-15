/**
 * Shared username/password fields for LoginPage and header popover.
 */
export default function LoginForm({
  username,
  password,
  onUsername,
  onPassword,
  error,
  submitting,
  disabled,
  idPrefix = 'login',
}) {
  return (
    <>
      <label className="auth-field" htmlFor={`${idPrefix}-username`}>
        <span>Username</span>
        <input
          id={`${idPrefix}-username`}
          autoComplete="username"
          value={username}
          onChange={(e) => onUsername(e.target.value)}
          required
          minLength={3}
        />
      </label>

      <label className="auth-field" htmlFor={`${idPrefix}-password`}>
        <span>Password</span>
        <input
          id={`${idPrefix}-password`}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          required
          minLength={4}
        />
      </label>

      {error ? (
        <div className="auth-error" role="alert">
          {error}
        </div>
      ) : null}

      <button type="submit" className="auth-submit" disabled={submitting || disabled}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </>
  )
}

import '../pages/authPages.css'

/**
 * Single-page readiness checklist: API → Postgres → Session.
 * @param {{
 *   steps: { api: string, postgres: string, session: string },
 *   lastError?: string | null,
 *   timedOut?: boolean,
 *   onRetry?: () => void,
 * }} props
 */
export default function StartupStatus({
  steps,
  lastError = null,
  timedOut = false,
  onRetry,
}) {
  const items = [
    {
      key: 'api',
      label: 'Backend API',
      runningHint: 'Spinning up backend…',
      doneHint: 'Backend is up',
      failedHint: 'Backend unreachable',
      status: steps.api,
    },
    {
      key: 'postgres',
      label: 'Postgres',
      runningHint: 'Waiting for database…',
      doneHint: 'Database is ready',
      failedHint: 'Database not ready',
      status: steps.postgres,
    },
    {
      key: 'session',
      label: 'Session',
      runningHint: 'Checking session…',
      doneHint: 'Session checked',
      failedHint: 'Session check failed',
      status: steps.session,
    },
  ]

  return (
    <div className="auth-page">
      <div className="auth-card startup-card">
        <h1 className="auth-card__title">Starting TIP</h1>
        <p className="auth-card__hint">
          Waiting for services so the app is ready before you continue.
        </p>

        <ol className="startup-steps" aria-live="polite">
          {items.map((item) => (
            <li
              key={item.key}
              className={`startup-step startup-step--${item.status || 'pending'}`}
            >
              <span className="startup-step__icon" aria-hidden="true">
                {item.status === 'done' && (
                  <span className="startup-tick">✓</span>
                )}
                {item.status === 'running' && (
                  <span className="startup-spinner" />
                )}
                {item.status === 'failed' && (
                  <span className="startup-fail">!</span>
                )}
                {item.status === 'pending' && (
                  <span className="startup-pending" />
                )}
              </span>
              <span className="startup-step__text">
                <span className="startup-step__label">{item.label}</span>
                <span className="startup-step__hint">
                  {item.status === 'done' && item.doneHint}
                  {item.status === 'running' && item.runningHint}
                  {item.status === 'failed' && item.failedHint}
                  {item.status === 'pending' && 'Waiting…'}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {lastError && (
          <div className="auth-error" role="status">
            {lastError}
          </div>
        )}

        {timedOut && (
          <button
            type="button"
            className="auth-submit"
            onClick={() => onRetry?.()}
            disabled={typeof onRetry !== 'function'}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

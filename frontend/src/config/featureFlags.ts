/**
 * Frontend feature flags (Vite build-time env).
 *
 * VITE_FEATURE_STARTUP_READY — staged readiness UI before session/routes.
 *   default ON when unset; set to "false" / "0" / "off" to disable.
 *
 * VITE_FEATURE_CHART_PAPER_TRADE — chart Buy/Sell chrome (buttons, modal, strip).
 *   default ON when unset; set to "false" / "0" / "off" to disable.
 *   Does not unmount ChartHeader; only gates trade chrome.
 */

function envTruthy(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue
  }
  const v = String(raw).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'off'].includes(v)) return false
  return defaultValue
}

/** When true: API → Postgres → session checklist before any app page. */
export function isStartupReadyEnabled(): boolean {
  return envTruthy(
    import.meta.env.VITE_FEATURE_STARTUP_READY as string | undefined,
    true,
  )
}

/** Chart paper Buy/Sell chrome — default ON. */
export function isChartPaperTradeEnabled(): boolean {
  return envTruthy(
    import.meta.env.VITE_FEATURE_CHART_PAPER_TRADE as string | undefined,
    true,
  )
}

/** Max time to wait for API + Postgres before showing Retry (ms). */
export const STARTUP_READY_TIMEOUT_MS = 180_000

/** Poll interval while waiting for health/DB (ms). */
export const STARTUP_READY_POLL_MS = 2_000

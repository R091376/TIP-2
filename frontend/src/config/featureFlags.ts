/**
 * Frontend feature flags (Vite build-time env).
 *
 * VITE_FEATURE_STARTUP_READY — staged readiness UI before session/routes.
 *   default ON when unset; set to "false" / "0" / "off" to disable.
 *
 * VITE_FEATURE_CHART_PAPER_TRADE — chart Buy/Sell chrome (buttons, modal, strip).
 *   default ON when unset; set to "false" / "0" / "off" to disable.
 *   Does not unmount ChartHeader; only gates trade chrome.
 *
 * VITE_FEATURE_APP_SHELL — broker-style left sidebar shell (always mounted in App.jsx).
 *   default ON; retained for docs / emergency env documentation.
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

/** Broker-style app shell — default ON (shell is the only authenticated layout). */
export function isAppShellEnabled(): boolean {
  return envTruthy(
    import.meta.env.VITE_FEATURE_APP_SHELL as string | undefined,
    true,
  )
}

/**
 * VITE_FEATURE_ADMIN_LEARN — Learn education UI (public routes + nav + login link).
 *   Name kept for env compatibility; access is no longer admin-only.
 *   default ON when unset (content shipped); set to "false" / "0" / "off" to disable.
 */
export function isAdminLearnEnabled(): boolean {
  return envTruthy(
    import.meta.env.VITE_FEATURE_ADMIN_LEARN as string | undefined,
    true,
  )
}

/** Alias: Learn is public education (guest + all roles). */
export function isLearnEnabled(): boolean {
  return isAdminLearnEnabled()
}

/**
 * VITE_FEATURE_PATTERN_RESEARCH_STATS — Pattern Stats Research mode (composable stack filters).
 * default ON; ADMIN-only in UI. Backend also requires Postgres journal + TIP_PATTERN_RESEARCH_STATS_ENABLED.
 */
export function isPatternResearchStatsEnabled(): boolean {
  return envTruthy(
    import.meta.env.VITE_FEATURE_PATTERN_RESEARCH_STATS as string | undefined,
    true,
  )
}

/** Woodie S/R research filters on Pattern Stats. Default ON. */
export function isPatternSrResearchEnabled(): boolean {
  return envTruthy(
    import.meta.env.VITE_FEATURE_PATTERN_SR_RESEARCH as string | undefined,
    true,
  )
}

/**
 * VITE_FEATURE_TIMEFRAME_1M — show/seed 1m on the chart and stats filters.
 * Default OFF (512MB: 1m history is ~2.6k bars/symbol and detectors ignore it).
 * Backend TIP_TIMEFRAME_1M_ENABLED is the seed/API source of truth; this flag
 * is the fallback list before /api/market/timeframes returns.
 */
export function isTimeframe1mEnabled(): boolean {
  return envTruthy(
    import.meta.env.VITE_FEATURE_TIMEFRAME_1M as string | undefined,
    false,
  )
}

/** Max time to wait for API + Postgres before showing Retry (ms). */
export const STARTUP_READY_TIMEOUT_MS = 180_000

/** Poll interval while waiting for health/DB (ms). */
export const STARTUP_READY_POLL_MS = 2_000

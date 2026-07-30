/**
 * Chart panel deep-link helpers (?panel=watchlist|alerts).
 * Presence-only apply; URL without panel is a no-op for consumers.
 */

export type ChartPanel = 'watchlist' | 'alerts'

export function parsePanel(search: string | URLSearchParams | null | undefined): ChartPanel | null {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search instanceof URLSearchParams
        ? search
        : new URLSearchParams()
  const raw = (params.get('panel') || '').trim().toLowerCase()
  if (raw === 'watchlist' || raw === 'alerts') return raw
  return null
}

/**
 * Strip only the panel param; keep symbol, tf, and others.
 */
export function stripPanelFromSearch(search: string | URLSearchParams | null | undefined): string {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search instanceof URLSearchParams
        ? new URLSearchParams(search)
        : new URLSearchParams()
  params.delete('panel')
  const q = params.toString()
  return q ? `?${q}` : ''
}

/**
 * Merge panel into existing search without dropping symbol/tf.
 */
export function mergePanelIntoSearch(
  search: string | URLSearchParams | null | undefined,
  panel: ChartPanel,
): string {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search instanceof URLSearchParams
        ? new URLSearchParams(search)
        : new URLSearchParams()
  params.set('panel', panel)
  return `?${params.toString()}`
}

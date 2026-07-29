/**
 * Client-side paper trade eligibility (chart Buy/Sell + tooltips).
 * Aligns with backend eligibility.py, with FE-only FAILED block by default.
 */

export type PaperTradableEntry = {
  symbolId?: string
  segment?: string
  instrumentType?: string
  bootstrapStatus?: string
  active?: boolean
} | null | undefined

export type PaperTradableUser = {
  tradingEnabled?: boolean
} | null | undefined

function normalizeStatus(status: string | null | undefined): string {
  return (status || '').toString().trim().toUpperCase()
}

/**
 * Whether an entry is tradable for paper equities.
 * FAILED is blocked by default (stricter than backend require_ready=False).
 * PENDING is allowed when otherwise eligible.
 */
export function isPaperTradableEntry(
  entry: PaperTradableEntry,
  { treatFailedAsBlocked = true }: { treatFailedAsBlocked?: boolean } = {},
): boolean {
  if (!entry || entry.active === false) return false
  if (normalizeStatus(entry.bootstrapStatus) === 'REMOVING') return false
  if (treatFailedAsBlocked && normalizeStatus(entry.bootstrapStatus) === 'FAILED') {
    return false
  }
  const seg = (entry.segment || '').toUpperCase()
  const itype = (entry.instrumentType || '').toUpperCase()
  const id = entry.symbolId || ''
  if (seg.includes('INDEX') || id.startsWith('NSE_INDEX')) return false
  if (seg !== 'NSE_EQ') return false
  return itype === 'EQ' || itype === 'BE'
}

/**
 * Ordered tooltip / title text for disabled trade chrome — first match wins.
 * Returns '' when enabled.
 */
export function paperTradeDisabledReason(
  entry: PaperTradableEntry,
  user?: PaperTradableUser,
): string {
  if (!entry?.symbolId) return 'Select a symbol'
  if (user?.tradingEnabled === false) return 'Trading disabled for your account'
  if (entry.active === false) return 'Symbol not active'
  if (normalizeStatus(entry.bootstrapStatus) === 'REMOVING') return 'Symbol not active'
  if (normalizeStatus(entry.bootstrapStatus) === 'FAILED') return 'Symbol not ready'
  const seg = (entry.segment || '').toUpperCase()
  const itype = (entry.instrumentType || '').toUpperCase()
  const id = entry.symbolId || ''
  if (
    seg.includes('INDEX') ||
    id.startsWith('NSE_INDEX') ||
    seg !== 'NSE_EQ' ||
    (itype !== 'EQ' && itype !== 'BE')
  ) {
    return 'Paper equities only'
  }
  return ''
}

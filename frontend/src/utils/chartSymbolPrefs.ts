/**
 * Persist last-selected chart symbol so bootstrap prefers equity over index.
 */

const LS_LAST_SYMBOL = 'tip.chart.lastSymbolId'

export function readLastChartSymbolId(): string | null {
  try {
    const v = localStorage.getItem(LS_LAST_SYMBOL)
    return v && v.trim() ? v.trim() : null
  } catch {
    return null
  }
}

export function writeLastChartSymbolId(symbolId: string | null | undefined): void {
  if (!symbolId || !String(symbolId).trim()) return
  try {
    localStorage.setItem(LS_LAST_SYMBOL, String(symbolId).trim())
  } catch {
    /* ignore quota / private mode */
  }
}

export type SymbolPickEntry = {
  symbolId?: string
  segment?: string
  instrumentType?: string
  bootstrapStatus?: string
  active?: boolean
}

function normalizeStatus(status: string | null | undefined): string {
  return (status || '').toString().trim().toUpperCase()
}

function isEquityEntry(e: SymbolPickEntry | null | undefined): boolean {
  if (!e?.symbolId || e.active === false) return false
  const seg = (e.segment || '').toUpperCase()
  const id = e.symbolId || ''
  const itype = (e.instrumentType || '').toUpperCase()
  if (seg.includes('INDEX') || id.startsWith('NSE_INDEX')) return false
  if (seg !== 'NSE_EQ') return false
  return itype === 'EQ' || itype === 'BE' || !itype
}

/**
 * Pick primary chart symbol: deep-link > last saved (if still on WL) >
 * first READY equity > first READY > first entry.
 */
export function pickPrimarySymbolEntry<T extends SymbolPickEntry>(
  entries: T[],
  deepSymbol: string | null | undefined,
  lastSymbolId: string | null | undefined = readLastChartSymbolId(),
): T | null {
  if (!entries?.length) return null

  if (deepSymbol) {
    const deep = entries.find((e) => e.symbolId === deepSymbol)
    if (deep) return deep
  }

  if (lastSymbolId) {
    const last = entries.find((e) => e.symbolId === lastSymbolId)
    if (last) return last
  }

  const readyEq = entries.find(
    (e) => isEquityEntry(e) && normalizeStatus(e.bootstrapStatus) === 'READY',
  )
  if (readyEq) return readyEq

  const anyEq = entries.find((e) => isEquityEntry(e))
  if (anyEq) return anyEq

  const ready = entries.find((e) => normalizeStatus(e.bootstrapStatus) === 'READY')
  if (ready) return ready

  return entries[0] ?? null
}

import { encodeSymbolId } from './watchlistApi'
import { api } from './http'
import type { WoodieDayLevels } from '../utils/woodieSr'

export type WoodieSrResponse = {
  symbolId: string
  method: string
  from: string
  to: string
  levels: WoodieDayLevels[]
}

export async function fetchWoodieSr(
  symbolId: string,
  opts: { from?: string; to?: string; signal?: AbortSignal } = {},
): Promise<WoodieSrResponse> {
  if (!symbolId) throw new Error('symbolId is required')
  const params = new URLSearchParams()
  if (opts.from) params.set('from', opts.from)
  if (opts.to) params.set('to', opts.to)
  const q = params.toString()
  const base = `/api/symbols/${encodeSymbolId(symbolId)}/sr`
  return api<WoodieSrResponse>(q ? `${base}?${q}` : base, { signal: opts.signal })
}

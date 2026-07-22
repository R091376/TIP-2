import { api } from './http'

export type InstrumentHitDto = {
  instrumentKey: string
  tradingSymbol: string
  displayName: string
  exchange: string
  segment: string
  instrumentType: string
}

export async function searchInstruments(
  q: string,
  limit = 15,
  signal?: AbortSignal,
): Promise<InstrumentHitDto[]> {
  const params = new URLSearchParams()
  params.set('q', q ?? '')
  if (limit != null) params.set('limit', String(limit))
  const data = await api<InstrumentHitDto[]>(`/api/instruments/search?${params.toString()}`, {
    signal,
  })
  return Array.isArray(data) ? data : []
}

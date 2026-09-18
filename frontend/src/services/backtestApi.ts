import { api } from './http'

export type BacktestTradeDto = {
  id: string
  instanceId?: string | null
  symbolId: string
  tradingSymbol?: string | null
  timeframe: string
  patternType: string
  direction: string
  detectTime: number
  entryTime?: number | null
  exitTime?: number | null
  entry?: number | null
  stop?: number | null
  target?: number | null
  fillEntry?: number | null
  fillExit?: number | null
  outcome?: string | null
  rMultiple?: number | null
  pnl?: number | null
  pnlPct?: number | null
  qty?: number
  flagConfirmed?: boolean
  flagRetested?: boolean
  flagEntryReached?: boolean
  volumeOk?: boolean
}

export type BacktestRunDto = {
  id: string
  createdBy?: string
  status: 'queued' | 'running' | 'done' | 'failed' | string
  spec?: Record<string, unknown>
  errorMessage?: string | null
  summary?: Record<string, unknown> | null
  createdAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  trades?: BacktestTradeDto[]
}

export type BacktestSpecInput = {
  symbols: string[]
  timeframes: string[]
  patternTypes: string[]
  fromDate: string
  toDate: string
  sessionStart?: string
  sessionEnd?: string
  targetR?: number
  minRiskR?: number
  maxRiskR?: number
  requireRetest?: boolean
  requireVolume?: boolean
  requireConfirmed?: boolean
  requireReclaimed?: boolean
  tradingSymbols?: Record<string, string>
  trade?: {
    enabled: boolean
    product: 'MIS' | 'CNC'
    qty: number
    stopWins?: boolean
    onePosition?: boolean
  }
}

export async function createBacktestRun(spec: BacktestSpecInput): Promise<BacktestRunDto> {
  return api<BacktestRunDto>('/api/backtests', {
    method: 'POST',
    body: JSON.stringify(spec),
  })
}

export async function listBacktestRuns(limit = 20): Promise<BacktestRunDto[]> {
  const data = await api<{ items: BacktestRunDto[] }>(`/api/backtests?limit=${limit}`)
  return Array.isArray(data?.items) ? data.items : []
}

export async function getBacktestRun(id: string): Promise<BacktestRunDto> {
  return api<BacktestRunDto>(`/api/backtests/${encodeURIComponent(id)}`)
}

export async function clearBacktestRuns(): Promise<{ deleted: number }> {
  return api<{ deleted: number }>('/api/backtests', { method: 'DELETE' })
}

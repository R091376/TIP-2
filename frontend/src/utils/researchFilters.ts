/**
 * Research (composable stack) filter URL codec + built-in presets.
 * groupBy is an exact enum (may contain commas) — never CSV-split it.
 */

export type GroupBy =
  | 'symbol,patternType,timeframe'
  | 'patternType,timeframe'
  | 'patternType'
  | 'none'

export type ResearchFilterParams = {
  symbolId?: string[]
  patternType?: string[]
  timeframe?: string[]
  direction?: 'long' | 'short'
  flagConfirmed?: boolean
  flagRetested?: boolean
  flagStrengthened?: boolean
  volumeOkAtDetect?: boolean
  confirmationMode?: string[]
  detectTimeIstStart?: string
  detectTimeIstEnd?: string
  detectedFrom?: string
  detectedTo?: string
  outcome?: string[]
  resolvedOnly?: boolean
  excludeReasons?: string[]
  includeReasons?: string[]
  minPlannedRr?: number
  requireValidRails?: boolean
  detectorVersion?: string[]
  groupBy?: GroupBy
  minSampleSize?: number
  limitGroups?: number
}

const GROUP_BY_ALLOWED = new Set<string>([
  'symbol,patternType,timeframe',
  'patternType,timeframe',
  'patternType',
  'none',
])

const CSV_KEYS = [
  'symbolId',
  'patternType',
  'timeframe',
  'confirmationMode',
  'outcome',
  'excludeReasons',
  'includeReasons',
  'detectorVersion',
] as const

function splitCsv(raw: string | null): string[] | undefined {
  if (raw == null || !String(raw).trim()) return undefined
  const parts = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length ? parts : undefined
}

function parseBool(raw: string | null): boolean | undefined {
  if (raw == null || raw === '') return undefined
  const v = String(raw).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'off'].includes(v)) return false
  return undefined
}

/** Parse research filters from URLSearchParams (ignores mode). */
export function parseResearchFiltersFromSearch(search: string | URLSearchParams): ResearchFilterParams {
  const sp = typeof search === 'string' ? new URLSearchParams(search) : search
  const out: ResearchFilterParams = {}

  for (const key of CSV_KEYS) {
    const v = splitCsv(sp.get(key))
    if (v) (out as Record<string, unknown>)[key] = v
  }

  const dir = sp.get('direction')
  if (dir === 'long' || dir === 'short') out.direction = dir

  const fc = parseBool(sp.get('flagConfirmed'))
  if (fc !== undefined) out.flagConfirmed = fc
  const fr = parseBool(sp.get('flagRetested'))
  if (fr !== undefined) out.flagRetested = fr
  const fs = parseBool(sp.get('flagStrengthened'))
  if (fs !== undefined) out.flagStrengthened = fs
  const vo = parseBool(sp.get('volumeOkAtDetect'))
  if (vo !== undefined) out.volumeOkAtDetect = vo

  const t0 = sp.get('detectTimeIstStart')
  const t1 = sp.get('detectTimeIstEnd')
  if (t0 && t1) {
    out.detectTimeIstStart = t0
    out.detectTimeIstEnd = t1
  }

  const d0 = sp.get('detectedFrom')
  const d1 = sp.get('detectedTo')
  if (d0) out.detectedFrom = d0
  if (d1) out.detectedTo = d1

  const ro = parseBool(sp.get('resolvedOnly'))
  if (ro !== undefined) out.resolvedOnly = ro
  const rr = parseBool(sp.get('requireValidRails'))
  if (rr !== undefined) out.requireValidRails = rr

  const minRr = sp.get('minPlannedRr')
  if (minRr != null && minRr !== '') {
    const n = Number(minRr)
    if (!Number.isNaN(n)) out.minPlannedRr = n
  }

  const gb = sp.get('groupBy')
  if (gb && GROUP_BY_ALLOWED.has(gb)) out.groupBy = gb as GroupBy

  const minN = sp.get('minSampleSize')
  if (minN != null && minN !== '') {
    const n = Number(minN)
    if (!Number.isNaN(n)) out.minSampleSize = n
  }
  const lim = sp.get('limitGroups')
  if (lim != null && lim !== '') {
    const n = Number(lim)
    if (!Number.isNaN(n)) out.limitGroups = n
  }

  return out
}

/** Serialize research filters to query string (without mode=). */
export function serializeResearchFilters(params: ResearchFilterParams): string {
  const sp = new URLSearchParams()
  const setCsv = (key: string, arr?: string[]) => {
    if (arr && arr.length) sp.set(key, arr.join(','))
  }
  setCsv('symbolId', params.symbolId)
  setCsv('patternType', params.patternType)
  setCsv('timeframe', params.timeframe)
  setCsv('confirmationMode', params.confirmationMode)
  setCsv('outcome', params.outcome)
  setCsv('excludeReasons', params.excludeReasons)
  setCsv('includeReasons', params.includeReasons)
  setCsv('detectorVersion', params.detectorVersion)

  if (params.direction) sp.set('direction', params.direction)
  if (params.flagConfirmed !== undefined) sp.set('flagConfirmed', String(params.flagConfirmed))
  if (params.flagRetested !== undefined) sp.set('flagRetested', String(params.flagRetested))
  if (params.flagStrengthened !== undefined)
    sp.set('flagStrengthened', String(params.flagStrengthened))
  if (params.volumeOkAtDetect !== undefined)
    sp.set('volumeOkAtDetect', String(params.volumeOkAtDetect))
  if (params.detectTimeIstStart) sp.set('detectTimeIstStart', params.detectTimeIstStart)
  if (params.detectTimeIstEnd) sp.set('detectTimeIstEnd', params.detectTimeIstEnd)
  if (params.detectedFrom) sp.set('detectedFrom', params.detectedFrom)
  if (params.detectedTo) sp.set('detectedTo', params.detectedTo)
  if (params.resolvedOnly !== undefined) sp.set('resolvedOnly', String(params.resolvedOnly))
  if (params.requireValidRails !== undefined)
    sp.set('requireValidRails', String(params.requireValidRails))
  if (params.minPlannedRr !== undefined) sp.set('minPlannedRr', String(params.minPlannedRr))
  if (params.groupBy) sp.set('groupBy', params.groupBy)
  if (params.minSampleSize !== undefined) sp.set('minSampleSize', String(params.minSampleSize))
  if (params.limitGroups !== undefined) sp.set('limitGroups', String(params.limitGroups))
  return sp.toString()
}

export type StackPreset = {
  id: string
  name: string
  filters: ResearchFilterParams
}

/** Built-in high-probability stack hypotheses (P0). */
export const BUILTIN_STACK_PRESETS: StackPreset[] = [
  {
    id: 'retest-volume-session',
    name: 'Retest + Volume + Session',
    filters: {
      flagRetested: true,
      volumeOkAtDetect: true,
      detectTimeIstStart: '09:30',
      detectTimeIstEnd: '15:00',
      excludeReasons: ['startup_recovery'],
      timeframe: ['5m', '15m', '1h'],
    },
  },
  {
    id: 'full-lifecycle',
    name: 'Full lifecycle quality',
    filters: {
      flagConfirmed: true,
      flagRetested: true,
      excludeReasons: ['startup_recovery'],
    },
  },
  {
    id: 'resolved-only',
    name: 'Resolved only (performance)',
    filters: {
      resolvedOnly: true,
      excludeReasons: ['startup_recovery', 'session_close', 'session_end'],
    },
  },
  {
    id: 'plan-rr-breakouts',
    name: 'Plan R:R ≥ 1.5 breakouts',
    filters: {
      patternType: ['breakout', 'volume_breakout'],
      minPlannedRr: 1.5,
    },
  },
  {
    id: 'long-breakout-quality',
    name: 'Long breakout quality',
    filters: {
      patternType: ['breakout'],
      direction: 'long',
      flagRetested: true,
      volumeOkAtDetect: true,
      detectTimeIstStart: '09:30',
      detectTimeIstEnd: '15:00',
      excludeReasons: ['startup_recovery'],
    },
  },
  {
    id: 'short-breakdown-quality',
    name: 'Short / breakdown quality',
    filters: {
      patternType: ['breakdown'],
      direction: 'short',
      flagRetested: true,
      volumeOkAtDetect: true,
      detectTimeIstStart: '09:30',
      detectTimeIstEnd: '15:00',
      excludeReasons: ['startup_recovery'],
    },
  },
  {
    id: 'pin-engulf-intraday',
    name: 'Intraday pin & engulf',
    filters: {
      patternType: ['hammer', 'shooting_star', 'bullish_engulfing', 'bearish_engulfing'],
      timeframe: ['5m', '15m'],
      detectTimeIstStart: '09:30',
      detectTimeIstEnd: '15:00',
      resolvedOnly: true,
      excludeReasons: ['startup_recovery'],
    },
  },
  {
    id: 'exclude-recovery',
    name: 'Clean exclude recovery',
    filters: {
      excludeReasons: ['startup_recovery'],
    },
  },
]

const USER_PRESETS_KEY = 'tip.research.stackPresets'

export function loadUserPresets(): StackPreset[] {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.filters,
    )
  } catch {
    return []
  }
}

export function saveUserPreset(preset: StackPreset): void {
  const all = loadUserPresets().filter((p) => p.id !== preset.id)
  all.push(preset)
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(all))
}

export function deleteUserPreset(id: string): void {
  const all = loadUserPresets().filter((p) => p.id !== id)
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(all))
}

/** Active filter chips for UI. */
export function researchFilterChips(params: ResearchFilterParams): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = []
  if (params.patternType?.length) chips.push({ key: 'patternType', label: `type: ${params.patternType.join(',')}` })
  if (params.timeframe?.length) chips.push({ key: 'timeframe', label: `tf: ${params.timeframe.join(',')}` })
  if (params.direction) chips.push({ key: 'direction', label: params.direction })
  if (params.flagConfirmed === true) chips.push({ key: 'flagConfirmed', label: 'confirmed' })
  if (params.flagRetested === true) chips.push({ key: 'flagRetested', label: 'retested' })
  if (params.flagStrengthened === true) chips.push({ key: 'flagStrengthened', label: 'strengthened' })
  if (params.volumeOkAtDetect === true) chips.push({ key: 'volumeOkAtDetect', label: 'volume OK' })
  if (params.detectTimeIstStart && params.detectTimeIstEnd) {
    chips.push({
      key: 'tod',
      label: `IST ${params.detectTimeIstStart}–${params.detectTimeIstEnd}`,
    })
  }
  if (params.detectedFrom || params.detectedTo) {
    chips.push({
      key: 'dates',
      label: `${params.detectedFrom || '…'} → ${params.detectedTo || '…'}`,
    })
  }
  if (params.resolvedOnly) chips.push({ key: 'resolvedOnly', label: 'resolved only' })
  if (params.excludeReasons?.length)
    chips.push({ key: 'excludeReasons', label: `excl: ${params.excludeReasons.join(',')}` })
  if (params.minPlannedRr != null)
    chips.push({ key: 'minPlannedRr', label: `plan RR ≥ ${params.minPlannedRr}` })
  if (params.groupBy && params.groupBy !== 'symbol,patternType,timeframe')
    chips.push({ key: 'groupBy', label: `group: ${params.groupBy}` })
  return chips
}

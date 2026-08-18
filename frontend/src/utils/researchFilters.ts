/**
 * Research (composable stack) filter URL codec + built-in presets.
 * groupBy is an exact enum (may contain commas) — never CSV-split it.
 */

export type GroupBy =
  | 'symbol,patternType,timeframe'
  | 'patternType,timeframe'
  | 'patternType'
  | 'none'
  | 'srNearest'
  | 'patternType,srNearest'

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
  /** Min planned stop distance in ATR (risk_r). Implies requireValidRails. */
  minRiskR?: number
  /** Max planned stop distance in ATR (risk_r). Implies requireValidRails. */
  maxRiskR?: number
  /** Keep groups whose Expected R (WR × plan R:R − (1−WR)) is at least this. */
  minExpectedR?: number
  requireValidRails?: boolean
  detectorVersion?: string[]
  srNearest?: string[]
  srCross?: string[]
  srNear?: boolean
  srConfluence?: boolean
  srBreak?: boolean
  srOpenThrough?: string[]
  srGapDir?: 'up' | 'down' | 'flat'
  srMethod?: string[]
  srStamped?: boolean
  groupBy?: GroupBy
  minSampleSize?: number
  limitGroups?: number
}

/** Matches backend TIP_RESEARCH_STATS_MAX_RANGE_DAYS default. */
export const RESEARCH_MAX_RANGE_DAYS = 180

export function todayIstYmd(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now)
}

/** Earliest detect date the UI should offer (today IST − (maxDays − 1)). */
export function researchEarliestDetectYmd(
  maxDays: number = RESEARCH_MAX_RANGE_DAYS,
  now: Date = new Date(),
): string {
  const today = todayIstYmd(now)
  const [y, m, d] = today.split('-').map(Number)
  const utc = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  utc.setUTCDate(utc.getUTCDate() - (Math.max(1, maxDays) - 1))
  return utc.toISOString().slice(0, 10)
}

const GROUP_BY_ALLOWED = new Set<string>([
  'symbol,patternType,timeframe',
  'patternType,timeframe',
  'patternType',
  'none',
  'srNearest',
  'patternType,srNearest',
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
  'srNearest',
  'srCross',
  'srOpenThrough',
  'srMethod',
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
  const srNear = parseBool(sp.get('srNear'))
  if (srNear !== undefined) out.srNear = srNear
  const srConf = parseBool(sp.get('srConfluence'))
  if (srConf !== undefined) out.srConfluence = srConf
  const srBr = parseBool(sp.get('srBreak'))
  if (srBr !== undefined) out.srBreak = srBr
  const srSt = parseBool(sp.get('srStamped'))
  if (srSt !== undefined) out.srStamped = srSt
  const gap = sp.get('srGapDir')
  if (gap === 'up' || gap === 'down' || gap === 'flat') out.srGapDir = gap

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

  const parseFiniteNonNeg = (raw: string | null): number | undefined => {
    if (raw == null || raw === '') return undefined
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return undefined
    return n
  }
  const parseFinite = (raw: string | null): number | undefined => {
    if (raw == null || raw === '') return undefined
    const n = Number(raw)
    if (!Number.isFinite(n)) return undefined
    return n
  }
  const minRr = parseFiniteNonNeg(sp.get('minPlannedRr'))
  if (minRr !== undefined) out.minPlannedRr = minRr
  const minRisk = parseFiniteNonNeg(sp.get('minRiskR'))
  if (minRisk !== undefined) out.minRiskR = minRisk
  const maxRisk = parseFiniteNonNeg(sp.get('maxRiskR'))
  if (maxRisk !== undefined) out.maxRiskR = maxRisk
  const minEdge = parseFinite(sp.get('minExpectedR'))
  if (minEdge !== undefined) out.minExpectedR = minEdge

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
  setCsv('srNearest', params.srNearest)
  setCsv('srCross', params.srCross)
  setCsv('srOpenThrough', params.srOpenThrough)
  setCsv('srMethod', params.srMethod)

  if (params.direction) sp.set('direction', params.direction)
  if (params.flagConfirmed !== undefined) sp.set('flagConfirmed', String(params.flagConfirmed))
  if (params.flagRetested !== undefined) sp.set('flagRetested', String(params.flagRetested))
  if (params.flagStrengthened !== undefined)
    sp.set('flagStrengthened', String(params.flagStrengthened))
  if (params.volumeOkAtDetect !== undefined)
    sp.set('volumeOkAtDetect', String(params.volumeOkAtDetect))
  if (params.srNear !== undefined) sp.set('srNear', String(params.srNear))
  if (params.srConfluence !== undefined) sp.set('srConfluence', String(params.srConfluence))
  if (params.srBreak !== undefined) sp.set('srBreak', String(params.srBreak))
  if (params.srStamped !== undefined) sp.set('srStamped', String(params.srStamped))
  if (params.srGapDir) sp.set('srGapDir', params.srGapDir)
  if (params.detectTimeIstStart) sp.set('detectTimeIstStart', params.detectTimeIstStart)
  if (params.detectTimeIstEnd) sp.set('detectTimeIstEnd', params.detectTimeIstEnd)
  if (params.detectedFrom) sp.set('detectedFrom', params.detectedFrom)
  if (params.detectedTo) sp.set('detectedTo', params.detectedTo)
  if (params.resolvedOnly !== undefined) sp.set('resolvedOnly', String(params.resolvedOnly))
  if (params.requireValidRails !== undefined)
    sp.set('requireValidRails', String(params.requireValidRails))
  if (params.minPlannedRr !== undefined) sp.set('minPlannedRr', String(params.minPlannedRr))
  if (params.minRiskR !== undefined) sp.set('minRiskR', String(params.minRiskR))
  if (params.maxRiskR !== undefined) sp.set('maxRiskR', String(params.maxRiskR))
  if (params.minExpectedR !== undefined) sp.set('minExpectedR', String(params.minExpectedR))
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

/** Product default: planned stop (risk_r) must be ≤ this ATR multiple. */
export const DEFAULT_MAX_RISK_R = 1.5

/**
 * Baseline Research filters applied on empty / Clear.
 * maxRiskR is a product stop-size cap (wide stops shrink plan R:R / Expected R).
 */
export const DEFAULT_RESEARCH_FILTERS: ResearchFilterParams = {
  maxRiskR: DEFAULT_MAX_RISK_R,
}

/** Merge product defaults under explicit params (URL / draft / preset). */
export function withResearchDefaults(params: ResearchFilterParams = {}): ResearchFilterParams {
  return { ...DEFAULT_RESEARCH_FILTERS, ...params }
}

/** Built-in stacks. Every preset includes maxRiskR ≤ 1.5. */
export const BUILTIN_STACK_PRESETS: StackPreset[] = [
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
      maxRiskR: DEFAULT_MAX_RISK_R,
    },
  },
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
      maxRiskR: DEFAULT_MAX_RISK_R,
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
      maxRiskR: DEFAULT_MAX_RISK_R,
    },
  },
  {
    id: 'full-lifecycle',
    name: 'Full lifecycle quality',
    filters: {
      flagConfirmed: true,
      flagRetested: true,
      excludeReasons: ['startup_recovery'],
      maxRiskR: DEFAULT_MAX_RISK_R,
    },
  },
  {
    id: 'sr-hammer-s2',
    name: 'Hammer at S2',
    filters: {
      patternType: ['hammer'],
      srNearest: ['s2'],
      srNear: true,
      srConfluence: true,
      maxRiskR: DEFAULT_MAX_RISK_R,
    },
  },
  {
    id: 'sr-breakout-clear-r1',
    name: 'Breakout cleared R1',
    filters: {
      patternType: ['breakout'],
      srCross: ['r1_up'],
      maxRiskR: DEFAULT_MAX_RISK_R,
    },
  },
  {
    id: 'sr-gap-down-s2',
    name: 'Gap through S2',
    filters: {
      srOpenThrough: ['s2_down'],
      srGapDir: 'down',
      maxRiskR: DEFAULT_MAX_RISK_R,
    },
  },
  {
    id: 'true-r-confirmed',
    name: 'Confirmed (robust)',
    filters: {
      flagConfirmed: true,
      resolvedOnly: true,
      excludeReasons: ['startup_recovery'],
      maxRiskR: DEFAULT_MAX_RISK_R,
    },
  },
  {
    id: 'true-r-hh-confirmed',
    name: 'Higher high · Confirmed',
    filters: {
      patternType: ['higher_high'],
      flagConfirmed: true,
      resolvedOnly: true,
      excludeReasons: ['startup_recovery'],
      maxRiskR: DEFAULT_MAX_RISK_R,
    },
  },
  {
    id: 'true-r-confirmed-risk-1',
    name: 'Confirmed · Risk 1.0–1.5',
    filters: {
      flagConfirmed: true,
      minRiskR: 1.0,
      maxRiskR: DEFAULT_MAX_RISK_R,
      resolvedOnly: true,
      excludeReasons: ['startup_recovery'],
      requireValidRails: true,
    },
  },
  {
    id: 'true-r-confirmed-plan-rr-risk-floor',
    name: 'Confirmed · Plan RR ≥ 1.5 · Risk 0.5–1.5',
    filters: {
      flagConfirmed: true,
      minPlannedRr: 1.5,
      minRiskR: 0.5,
      maxRiskR: DEFAULT_MAX_RISK_R,
      resolvedOnly: true,
      excludeReasons: ['startup_recovery'],
      requireValidRails: true,
    },
  },
  {
    id: 'exclude-recovery',
    name: 'Clean exclude recovery',
    filters: {
      excludeReasons: ['startup_recovery'],
      maxRiskR: DEFAULT_MAX_RISK_R,
    },
  },
  {
    id: 'resolved-only',
    name: 'Resolved only (performance)',
    filters: {
      resolvedOnly: true,
      excludeReasons: ['startup_recovery', 'session_close', 'session_end'],
      maxRiskR: DEFAULT_MAX_RISK_R,
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
      maxRiskR: DEFAULT_MAX_RISK_R,
    },
  },
  {
    id: 'plan-rr-breakouts',
    name: 'Plan R:R ≥ 1.5 breakouts',
    filters: {
      patternType: ['breakout', 'volume_breakout'],
      minPlannedRr: 1.5,
      minRiskR: 0.5,
      maxRiskR: DEFAULT_MAX_RISK_R,
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
  if (params.srNearest?.length) chips.push({ key: 'srNearest', label: `SR: ${params.srNearest.join(',')}` })
  if (params.srCross?.length) chips.push({ key: 'srCross', label: `cross: ${params.srCross.join(',')}` })
  if (params.srNear === true) chips.push({ key: 'srNear', label: 'near S/R' })
  if (params.srConfluence === true) chips.push({ key: 'srConfluence', label: 'SR confluence' })
  if (params.srBreak === true) chips.push({ key: 'srBreak', label: 'SR break' })
  if (params.srOpenThrough?.length)
    chips.push({ key: 'srOpenThrough', label: `open thru: ${params.srOpenThrough.join(',')}` })
  if (params.srGapDir) chips.push({ key: 'srGapDir', label: `gap ${params.srGapDir}` })
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
  if (params.minRiskR != null)
    chips.push({ key: 'minRiskR', label: `risk R ≥ ${params.minRiskR}` })
  if (params.maxRiskR != null)
    chips.push({ key: 'maxRiskR', label: `risk R ≤ ${params.maxRiskR}` })
  if (params.minExpectedR != null)
    chips.push({ key: 'minExpectedR', label: `Expected R ≥ ${params.minExpectedR}` })
  if (params.requireValidRails)
    chips.push({ key: 'requireValidRails', label: 'valid rails' })
  if (params.groupBy && params.groupBy !== 'symbol,patternType,timeframe')
    chips.push({ key: 'groupBy', label: `group: ${params.groupBy}` })
  return chips
}

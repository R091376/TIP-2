import { istYmdFromUtcSeconds, utcToNseChartTime } from './chartTime'

/** Named ladder drawn on the chart. R4/S4 stay on the daily row only. */
export const WOODIE_LEVEL_KEYS = ['s3', 's2', 's1', 'pp', 'r1', 'r2', 'r3'] as const
export type WoodieLevelKey = (typeof WOODIE_LEVEL_KEYS)[number]

export const WOODIE_LEVEL_COLORS: Record<WoodieLevelKey, string> = {
  s3: '#166534',
  s2: '#22c55e',
  s1: '#86efac',
  pp: '#fbbf24',
  r1: '#fca5a5',
  r2: '#ef4444',
  r3: '#991b1b',
}

export const WOODIE_LEVEL_LABELS: Record<WoodieLevelKey, string> = {
  s3: 'S3',
  s2: 'S2',
  s1: 'S1',
  pp: 'PP',
  r1: 'R1',
  r2: 'R2',
  r3: 'R3',
}

export type WoodieDayLevels = {
  sessionDate: string
  freezeSource?: string
  pp: number
  r1: number
  s1: number
  r2: number
  s2: number
  r3: number
  s3: number
  r4?: number
  s4?: number
  todayOpen?: number
  prevHigh?: number
  prevLow?: number
  prevClose?: number
  gap?: number
}

const IST_OFFSET_SEC = 5 * 3600 + 30 * 60

/** Lockstep with backend/app/market/data/cas_fo_cash_symbols.json as_of. */
export const CAS_AS_OF = '2026-08-03'

export function parseCtsEnd(ctsEnd: string | null | undefined): {
  hour: number
  minute: number
} {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(ctsEnd || '').trim())
  if (!m) return { hour: 15, minute: 30 }
  return { hour: Number(m[1]), minute: Number(m[2]) }
}

export function clipSegmentEnd(
  lastCandleChart: number,
  sessionDate: string,
  ctsHour: number,
  ctsMinute: number,
): number {
  const ctsUnix = nseSessionUtcSeconds(sessionDate, ctsHour, ctsMinute)
  if (!ctsUnix) return lastCandleChart
  const ctsChart = utcToNseChartTime(ctsUnix)
  return Math.max(lastCandleChart, ctsChart)
}

export function effectiveCtsForDate(
  ymd: string,
  liveHour: number,
  liveMinute: number,
): { hour: number; minute: number } {
  const day = normalizeYmd(ymd)
  if (!day || day < CAS_AS_OF) return { hour: 15, minute: 30 }
  return { hour: liveHour, minute: liveMinute }
}

export function nseSessionUtcSeconds(
  sessionDate: string,
  hour: number,
  minute: number,
): number {
  const parts = sessionDate.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return 0
  const [y, m, d] = parts
  return Math.floor(Date.UTC(y, m - 1, d, hour, minute, 0) / 1000) - IST_OFFSET_SEC
}

export function pickActiveSessionDate(
  days: WoodieDayLevels[],
  todayYmd: string,
): string | null {
  if (days.some((d) => d.sessionDate === todayYmd)) return todayYmd
  return days.length ? days[days.length - 1].sessionDate : null
}

export type WoodieSessionSegment = {
  sessionDate: string
  start: number
  end: number
  prices: Partial<Record<WoodieLevelKey, number>>
}

export function normalizeYmd(raw: string | null | undefined): string {
  const s = String(raw || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

/** Same formula as backend woodie_open_v1 (display fallback only). */
export function computeWoodieOpenV1(
  prevHigh: number,
  prevLow: number,
  prevClose: number,
  todayOpen: number,
): Partial<Record<WoodieLevelKey, number>> | null {
  if (
    ![prevHigh, prevLow, prevClose, todayOpen].every((n) => Number.isFinite(n)) ||
    prevHigh < prevLow
  ) {
    return null
  }
  const rng = prevHigh - prevLow
  const pp = (prevHigh + prevLow + 2 * todayOpen) / 4
  return {
    pp,
    r1: 2 * pp - prevLow,
    s1: 2 * pp - prevHigh,
    r2: pp + rng,
    s2: pp - rng,
    r3: prevHigh + 2 * (pp - prevLow),
    s3: prevLow - 2 * (prevHigh - pp),
  }
}

function pricesFromFrozen(day: WoodieDayLevels): Partial<Record<WoodieLevelKey, number>> {
  const prices: Partial<Record<WoodieLevelKey, number>> = {}
  for (const key of WOODIE_LEVEL_KEYS) {
    const v = Number(day[key])
    if (Number.isFinite(v)) prices[key] = v
  }
  return prices
}

type CandleLike = {
  time: number
  open?: number
  high?: number
  low?: number
  close?: number
}

type DayGroup = {
  ymd: string
  first: number
  last: number
  open: number
  high: number
  low: number
  close: number
}

/**
 * One horizontal span per IST session that has candles on the chart.
 * Frozen Neon rows win; missing days use prev session H/L/C + this session’s open.
 */
export function buildSessionSegments(
  days: WoodieDayLevels[],
  candles?: CandleLike[] | null,
  cts?: { hour?: number; minute?: number } | null,
): WoodieSessionSegment[] {
  const frozenByDay = new Map<string, Partial<Record<WoodieLevelKey, number>>>()
  for (const day of days || []) {
    const ymd = normalizeYmd(day.sessionDate)
    if (!ymd) continue
    const prices = pricesFromFrozen(day)
    if (Object.keys(prices).length) frozenByDay.set(ymd, prices)
  }

  const groups: DayGroup[] = []
  const byYmd = new Map<string, DayGroup>()
  for (const c of candles || []) {
    const ymd = istYmdFromUtcSeconds(c.time)
    if (!ymd) continue
    const ct = utcToNseChartTime(c.time)
    const o = Number(c.open)
    const h = Number(c.high)
    const l = Number(c.low)
    const cl = Number(c.close)
    let g = byYmd.get(ymd)
    if (!g) {
      g = {
        ymd,
        first: ct,
        last: ct,
        open: o,
        high: h,
        low: l,
        close: cl,
      }
      byYmd.set(ymd, g)
      groups.push(g)
    } else {
      if (ct < g.first) {
        g.first = ct
        if (Number.isFinite(o)) g.open = o
      }
      if (ct > g.last) {
        g.last = ct
        if (Number.isFinite(cl)) g.close = cl
      }
      if (Number.isFinite(h)) g.high = Math.max(g.high, h)
      if (Number.isFinite(l)) g.low = Math.min(g.low, l)
    }
  }

  const out: WoodieSessionSegment[] = []
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]
    let prices = frozenByDay.get(g.ymd)
    if (!prices && i > 0) {
      const prev = groups[i - 1]
      prices = computeWoodieOpenV1(prev.high, prev.low, prev.close, g.open) ?? undefined
    }
    if (!prices || !Object.keys(prices).length) continue
    if (g.first <= 0 || g.last < g.first) continue
    const liveH = cts?.hour ?? 15
    const liveM = cts?.minute ?? 30
    const eff = effectiveCtsForDate(g.ymd, liveH, liveM)
    const end = clipSegmentEnd(g.last, g.ymd, eff.hour, eff.minute)
    out.push({
      sessionDate: g.ymd,
      start: g.first,
      end,
      prices,
    })
  }
  return out
}

/** Keep only the IST session for `todayYmd`, or the latest session if today has no row. */
export function filterSegmentsTodayOnly(
  segments: WoodieSessionSegment[],
  todayYmd: string,
): WoodieSessionSegment[] {
  if (!segments.length) return segments
  const ymd = normalizeYmd(todayYmd)
  const today = segments.filter((s) => s.sessionDate === ymd)
  if (today.length) return today
  return [segments[segments.length - 1]]
}

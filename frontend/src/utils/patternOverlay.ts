import { createSeriesMarkers, LineStyle } from 'lightweight-charts'
import { utcToNseChartTime } from './chartTime'

/** Bars visible on each side of the focused event (logical range). */
const FOCUS_BARS_EACH_SIDE = 40

/** Memory / series key: symbolId + timeframe */
export function seriesKey(
  symbolId: string | null | undefined,
  timeframe: string | null | undefined,
): string | null {
  if (!symbolId || !timeframe) return null
  return `${symbolId}|${timeframe}`
}

export type StageColors = { line: string; marker: string }

/**
 * Stage → marker / price-line colors (dark theme).
 */
export function stageColors(stage: string | null | undefined): StageColors {
  const s = (stage || '').toLowerCase()
  switch (s) {
    case 'succeeded':
      return { line: '#22c55e', marker: '#22c55e' }
    case 'failed':
      return { line: '#ef4444', marker: '#ef4444' }
    case 'expired':
      return { line: '#64748b', marker: '#94a3b8' }
    case 'confirmed':
      return { line: '#38bdf8', marker: '#38bdf8' }
    case 'retested':
    case 'strengthened':
      return { line: '#f59e0b', marker: '#fbbf24' }
    case 'detected':
    default:
      return { line: '#a78bfa', marker: '#c4b5fd' }
  }
}

/** Short labels for chart markers (keep readable at small size). */
export function stageShortLabel(stage: string | null | undefined): string {
  switch ((stage || '').toLowerCase()) {
    case 'detected':
      return 'DET'
    case 'confirmed':
      return 'CNF'
    case 'retested':
      return 'RT'
    case 'strengthened':
      return 'STR'
    case 'succeeded':
      return 'WIN'
    case 'failed':
      return 'FAIL'
    case 'expired':
      return 'EXP'
    default:
      return 'EVT'
  }
}

/**
 * Bar-relative anchor: longs above the candle, shorts below (invalidations opposite).
 * Stage-specific shapes/sizes intentionally not used — keep markers uniform.
 */
function markerPosition(
  stage: string | null | undefined,
  direction: string | null | undefined,
): 'aboveBar' | 'belowBar' {
  const s = (stage || '').toLowerCase()
  const short = direction === 'short'
  if (s === 'failed' || s === 'expired') {
    // Invalidation sits on the adverse side of the bar
    return short ? 'aboveBar' : 'belowBar'
  }
  return short ? 'belowBar' : 'aboveBar'
}

const STAGE_ORDER: Record<string, number> = {
  detected: 1,
  confirmed: 2,
  retested: 3,
  strengthened: 4,
  succeeded: 5,
  failed: 5,
  expired: 5,
}

export type PatternAlertLike = {
  id?: string
  instanceId?: string
  time?: number
  stage?: string
  symbolId?: string
  timeframe?: string
  patternType?: string
  direction?: string
  referenceLevel?: number
  price?: number
  [key: string]: unknown
}

/**
 * All session events for one pattern instance, oldest first.
 */
export function collectInstanceEvents(
  alerts: PatternAlertLike[] | null | undefined,
  instanceId: string | null | undefined,
): PatternAlertLike[] {
  if (!instanceId || !alerts?.length) return []
  return alerts
    .filter((a) => a.instanceId === instanceId)
    .slice()
    .sort((a, b) => {
      const ta = a.time ?? 0
      const tb = b.time ?? 0
      if (ta !== tb) return ta - tb
      const oa = STAGE_ORDER[(a.stage || '').toLowerCase()] ?? 9
      const ob = STAGE_ORDER[(b.stage || '').toLowerCase()] ?? 9
      return oa - ob
    })
}

/**
 * Nearest value in a sorted ascending numeric array.
 */
export function nearestInSorted(
  sorted: number[] | null | undefined,
  target: number | null | undefined,
): { value: number; index: number } | null {
  if (!sorted?.length || target == null || Number.isNaN(Number(target))) return null
  const t = Number(target)
  let lo = 0
  let hi = sorted.length - 1
  if (t <= sorted[0]) return { value: sorted[0], index: 0 }
  if (t >= sorted[hi]) return { value: sorted[hi], index: hi }
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const v = sorted[mid]
    if (v === t) return { value: v, index: mid }
    if (v < t) lo = mid + 1
    else hi = mid - 1
  }
  // lo is first > t, hi is last < t
  const a = sorted[hi]
  const b = sorted[lo]
  if (Math.abs(a - t) <= Math.abs(b - t)) return { value: a, index: hi }
  return { value: b, index: lo }
}

/** Loose LWC series/chart handles — avoid tight coupling to library generics. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LwcSeries = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LwcChart = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LwcPriceLine = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LwcMarkersPlugin = any

export type PatternOverlayRails = {
  reference?: number | null
  entry?: number | null
  stop?: number | null
  target?: number | null
}

export type PatternOverlayHandle = {
  series: LwcSeries
  priceLine?: LwcPriceLine | null
  /** Extra rails (entry / stop / target). */
  railLines?: LwcPriceLine[]
  markersPlugin?: LwcMarkersPlugin | null
  instanceId?: string
  focusAlertId?: string
  symbolId?: string
  timeframe?: string
  /** Chart times (NSE-shifted) that have markers for this paint. */
  markerChartTimes?: number[]
}

/** Clear previous price lines + series markers plugin. */
export function clearPatternOverlay(handle: PatternOverlayHandle | null | undefined): void {
  if (!handle?.series) return
  try {
    if (handle.priceLine) {
      handle.series.removePriceLine(handle.priceLine)
    }
  } catch {
    // series may already be disposed
  }
  if (handle.railLines?.length) {
    for (const line of handle.railLines) {
      try {
        handle.series.removePriceLine(line)
      } catch {
        // ignore
      }
    }
  }
  try {
    if (handle.markersPlugin) {
      handle.markersPlugin.setMarkers([])
      handle.markersPlugin.detach?.()
    }
  } catch {
    // ignore
  }
}

export type OverlaySpec = {
  events?: PatternAlertLike[]
  focusAlert?: PatternAlertLike
  patternType?: string
  direction?: string
  referenceLevel?: number
  instanceId?: string
  seriesChartTimes?: number[]
  focusView?: boolean
  /** Optional trade rails from full instance DTO. */
  rails?: PatternOverlayRails | null
}

function tryCreatePriceLine(
  series: LwcSeries,
  opts: {
    price: number
    color: string
    lineWidth?: number
    lineStyle?: number
    title: string
  },
): LwcPriceLine | null {
  if (!Number.isFinite(opts.price)) return null
  try {
    return series.createPriceLine({
      price: opts.price,
      color: opts.color,
      lineWidth: opts.lineWidth ?? 1,
      lineStyle: opts.lineStyle ?? LineStyle.Dashed,
      axisLabelVisible: true,
      title: opts.title,
    })
  } catch {
    return null
  }
}

/**
 * Draw full instance lifecycle: reference line + optional entry/stop/target + stage markers.
 */
export function applyInstanceOverlay(
  series: LwcSeries,
  chart: LwcChart,
  spec: OverlaySpec | null | undefined,
): PatternOverlayHandle | null {
  if (!series || !chart || !spec) return null
  const events: PatternAlertLike[] = spec.events?.length
    ? spec.events
    : spec.focusAlert
      ? [spec.focusAlert]
      : []
  if (!events.length) return null

  // Only zoom when explicitly requested — alert clicks must not reshape the viewport.
  const focusView = spec.focusView === true
  const focus = spec.focusAlert || events[events.length - 1]
  const rails = spec.rails || null
  const ref =
    Number(
      rails?.reference ??
        spec.referenceLevel ??
        focus.referenceLevel ??
        events.find((e: PatternAlertLike) => e.referenceLevel != null)?.referenceLevel,
    ) || Number(focus.price)

  if (!Number.isFinite(ref)) return null

  const seriesChartTimes = Array.isArray(spec.seriesChartTimes)
    ? spec.seriesChartTimes
    : []
  const latestStage = events[events.length - 1]?.stage || focus.stage
  const lineColors = stageColors(latestStage)
  const typeLabel = (spec.patternType || focus.patternType || '').replace(/_/g, ' ')
  const direction = spec.direction || focus.direction
  const dirBit = direction ? ` · ${direction}` : ''

  const priceLine = tryCreatePriceLine(series, {
    price: ref,
    color: lineColors.line,
    lineWidth: 2,
    lineStyle: LineStyle.Dashed,
    title: `Ref ${formatShortPrice(ref)}${typeLabel ? ` · ${typeLabel}` : ''}${dirBit}`,
  })
  if (!priceLine) return null

  const railLines: LwcPriceLine[] = []
  const entry = Number(rails?.entry)
  const stop = Number(rails?.stop)
  const target = Number(rails?.target)
  // Avoid duplicate lines when entry/stop equals reference
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

  if (Number.isFinite(entry) && !near(entry, ref)) {
    const line = tryCreatePriceLine(series, {
      price: entry,
      color: '#38bdf8',
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      title: `Entry ${formatShortPrice(entry)}`,
    })
    if (line) railLines.push(line)
  }
  if (Number.isFinite(stop) && !near(stop, ref) && !(Number.isFinite(entry) && near(stop, entry))) {
    const line = tryCreatePriceLine(series, {
      price: stop,
      color: '#ef4444',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: `Stop ${formatShortPrice(stop)}`,
    })
    if (line) railLines.push(line)
  }
  if (
    Number.isFinite(target) &&
    !near(target, ref) &&
    !(Number.isFinite(entry) && near(target, entry))
  ) {
    const line = tryCreatePriceLine(series, {
      price: target,
      color: '#22c55e',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      title: `Target ${formatShortPrice(target)}`,
    })
    if (line) railLines.push(line)
  }

  const markerSpecs = events.map((ev: PatternAlertLike) => {
    const colors = stageColors(ev.stage)
    const rawChartTime = utcToNseChartTime(ev.time)
    const snapped = nearestInSorted(seriesChartTimes, rawChartTime)
    const chartTime = snapped?.value ?? rawChartTime
    return {
      time: chartTime,
      position: markerPosition(ev.stage, direction),
      // Uniform circle + size — bar position + short label carry meaning
      shape: 'circle' as const,
      color: colors.marker,
      text: stageShortLabel(ev.stage),
      size: 1,
      _focus: ev.id === focus.id,
    }
  })

  // Same bar time: merge short labels instead of dropping earlier stages
  type MarkerSpec = (typeof markerSpecs)[number]
  const byTime = new Map<number, MarkerSpec>()
  for (const m of markerSpecs) {
    const prev = byTime.get(m.time)
    if (!prev) {
      byTime.set(m.time, m)
      continue
    }
    const texts = new Set(
      `${prev.text}`.split('·').concat(`${m.text}`.split('·')).map((t) => t.trim()).filter(Boolean),
    )
    byTime.set(m.time, {
      ...m,
      // Keep a single bar-relative position (prefer non-fail if mixed)
      position: prev.position === m.position ? m.position : markerPosition(null, direction),
      text: [...texts].join('·'),
      color: m._focus ? m.color : prev._focus ? prev.color : m.color,
      _focus: prev._focus || m._focus,
    })
  }
  const dedupedMarkers = [...byTime.values()].map(({ _focus, ...rest }) => rest)

  let markersPlugin: LwcMarkersPlugin | null = null
  try {
    markersPlugin = createSeriesMarkers(series, dedupedMarkers)
  } catch {
    markersPlugin = null
  }

  if (focusView) {
    const focusChartTime = utcToNseChartTime(focus.time)
    tryFocusAroundBar(chart, seriesChartTimes, focusChartTime)
  }

  return {
    series,
    priceLine,
    railLines,
    markersPlugin,
    instanceId: spec.instanceId || focus.instanceId,
    focusAlertId: focus.id,
    symbolId: focus.symbolId,
    timeframe: focus.timeframe,
    markerChartTimes: dedupedMarkers.map((m) => Number(m.time)).filter(Number.isFinite),
  }
}

/**
 * Find an alert whose candle maps to the **same series bar** as the click.
 * LWC click times are bar times — we require an exact match after snap (no fuzzy maxDelta).
 * Prefer events for preferredInstanceId when set.
 */
export function findAlertAtChartTime(
  alerts: PatternAlertLike[] | null | undefined,
  chartTime: number | null | undefined,
  opts: {
    symbolId?: string | null
    timeframe?: string | null
    preferredInstanceId?: string | null
    seriesChartTimes?: number[] | null
    /**
     * When set, only hit if the clicked bar is one of these marker chart times
     * (or an alert that maps onto the same bar). Empty array = no hit.
     */
    markerChartTimes?: number[] | null
    /** @deprecated ignored — exact bar match only */
    maxDelta?: number
  } = {},
): PatternAlertLike | null {
  if (chartTime == null || !Number.isFinite(Number(chartTime)) || !alerts?.length) {
    return null
  }
  const seriesTimes = opts.seriesChartTimes || []
  const clickSnap = nearestInSorted(seriesTimes, Number(chartTime))
  const barTime = clickSnap?.value ?? Number(chartTime)

  // Optional: only bars that currently have painted markers
  if (opts.markerChartTimes != null) {
    const markerSet = new Set(
      opts.markerChartTimes.map(Number).filter((n) => Number.isFinite(n)),
    )
    if (!markerSet.has(barTime)) {
      // Also allow if any marker snaps to this bar
      let onMarker = false
      for (const mt of markerSet) {
        const s = nearestInSorted(seriesTimes, mt)
        if ((s?.value ?? mt) === barTime) {
          onMarker = true
          break
        }
      }
      if (!onMarker) return null
    }
  }

  const candidates = alerts.filter((a) => {
    if (opts.symbolId && a.symbolId !== opts.symbolId) return false
    if (opts.timeframe && a.timeframe !== opts.timeframe) return false
    if (a.time == null) return false
    const raw = utcToNseChartTime(a.time)
    const snapped = nearestInSorted(seriesTimes, raw)
    const ct = snapped?.value ?? raw
    return ct === barTime
  })
  if (!candidates.length) return null

  let pool = candidates
  if (opts.preferredInstanceId) {
    const preferred = candidates.filter((a) => a.instanceId === opts.preferredInstanceId)
    if (preferred.length) pool = preferred
  }

  pool.sort((a, b) => {
    const oa = STAGE_ORDER[(a.stage || '').toLowerCase()] ?? 9
    const ob = STAGE_ORDER[(b.stage || '').toLowerCase()] ?? 9
    return oa - ob
  })
  return pool[0]
}

function formatShortPrice(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return ''
  return Number(n).toFixed(2)
}

/**
 * Focus viewport on ~FOCUS_BARS_EACH_SIDE bars around the event (logical range).
 */
export function tryFocusAroundBar(
  chart: LwcChart,
  seriesChartTimes: number[] | null | undefined,
  focusChartTime: number,
): void {
  if (!chart) return
  try {
    const ts = chart.timeScale()
    if (seriesChartTimes?.length) {
      const near = nearestInSorted(seriesChartTimes, focusChartTime)
      const idx = near?.index ?? seriesChartTimes.length - 1
      const from = Math.max(0, idx - FOCUS_BARS_EACH_SIDE)
      const to = Math.min(seriesChartTimes.length - 1, idx + FOCUS_BARS_EACH_SIDE)
      // Logical range: half-open feel — pad edges slightly
      ts.setVisibleLogicalRange({
        from: from - 0.5,
        to: to + 0.5,
      })
      return
    }
    // Fallback: modest wall-clock window if no series times
    const pad = 60 * 60
    ts.setVisibleRange({
      from: focusChartTime - pad,
      to: focusChartTime + pad,
    })
  } catch {
    try {
      chart.timeScale().scrollToRealTime()
    } catch {
      // ignore
    }
  }
}

/** Whether restore/pending overlay is expected for current series. */
export function willRestoreOverlay(
  pending: { symbolId?: string; timeframe?: string } | null | undefined,
  memoryFocus: unknown,
  symbolId: string | null | undefined,
  timeframe: string | null | undefined,
): boolean {
  if (
    pending &&
    pending.symbolId === symbolId &&
    pending.timeframe === timeframe
  ) {
    return true
  }
  return Boolean(memoryFocus)
}

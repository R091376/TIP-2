import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineSeries,
} from 'lightweight-charts'
import { utcToNseChartTime } from '../utils/chartTime'

/** Candle/bar width in px (LWC default ~6). Applied on create and after symbol/TF load. */
export const BAR_SPACING = 7

/** Target volume subplot share of chart height (capped by max px). */
export const VOLUME_PANE_HEIGHT_RATIO = 0.18
/** Hard ceiling so volume never steals the price pane (line/candle switch included). */
export const VOLUME_PANE_MAX_PX = 96
export const VOLUME_PANE_MIN_PX = 52

/** Matches backend breakout volume baseline (docs/indicators/volume-sma-20.md). */
export const VOLUME_SMA_PERIOD = 20

const VOLUME_UP_COLOR = 'rgba(34, 197, 94, 0.5)'
const VOLUME_DOWN_COLOR = 'rgba(239, 68, 68, 0.5)'
/** Blue line on the volume pane: simple moving average of volume. */
export const VOLUME_SMA_COLOR = '#60a5fa'
/** Human-readable label for the volume SMA series. */
export const VOLUME_SMA_LABEL = `Vol SMA ${VOLUME_SMA_PERIOD}`

export const MARKET_CLOSED_MSG = 'Market is closed. Showing last available candle data.'

export function toCandlestickPoint(candle) {
  return {
    time: utcToNseChartTime(candle.time),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }
}

export function toLinePoint(candle) {
  return {
    time: utcToNseChartTime(candle.time),
    value: candle.close,
  }
}

export function mapSeriesData(type, candles) {
  return type === 'line'
    ? candles.map(toLinePoint)
    : candles.map(toCandlestickPoint)
}

/**
 * TradingView-style volume bar: green when close >= open, red otherwise.
 * @param {{ time: number, open: number, close: number, volume?: number }} candle
 */
export function toVolumePoint(candle) {
  const up = Number(candle.close) >= Number(candle.open)
  return {
    time: utcToNseChartTime(candle.time),
    value: Number(candle.volume) || 0,
    color: up ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR,
  }
}

export function mapVolumeData(candles) {
  return (candles || []).map(toVolumePoint)
}

/**
 * Simple SMA of volume. Emits points only once {@link VOLUME_SMA_PERIOD} bars exist.
 * @param {Array<{ time: number, volume?: number }>} candles sorted ascending by time
 * @param {number} [period=VOLUME_SMA_PERIOD]
 */
export function mapVolumeSmaData(candles, period = VOLUME_SMA_PERIOD) {
  const list = candles || []
  if (list.length < period || period <= 0) return []

  const points = []
  let windowSum = 0
  for (let i = 0; i < list.length; i++) {
    windowSum += Number(list[i].volume) || 0
    if (i >= period) {
      windowSum -= Number(list[i - period].volume) || 0
    }
    if (i >= period - 1) {
      points.push({
        time: utcToNseChartTime(list[i].time),
        value: windowSum / period,
      })
    }
  }
  return points
}

/**
 * Last SMA point for live updates (same formula as {@link mapVolumeSmaData}).
 * @returns {{ time: number, value: number } | null}
 */
export function lastVolumeSmaPoint(candles, period = VOLUME_SMA_PERIOD) {
  const list = candles || []
  if (list.length < period || period <= 0) return null
  let sum = 0
  for (let i = list.length - period; i < list.length; i++) {
    sum += Number(list[i].volume) || 0
  }
  const last = list[list.length - 1]
  return {
    time: utcToNseChartTime(last.time),
    value: sum / period,
  }
}

export function resolveDisplayStatus(wsStatus, marketPhase) {
  if (marketPhase === 'closed') return 'market_closed'
  if (marketPhase === 'pre_open') return 'pre_open'
  return wsStatus
}

export function normalizeStatus(s) {
  return (s || '').toString().toUpperCase()
}

export function entryFailedMessage(entry) {
  if (!entry) return null
  if (normalizeStatus(entry.bootstrapStatus) !== 'FAILED') return null
  return entry.bootstrapError || `Bootstrap failed for ${entry.tradingSymbol || entry.symbolId}`
}

export function buildSymbolLabels(watchlist) {
  const map = {}
  for (const e of watchlist || []) {
    map[e.symbolId] = e.tradingSymbol || e.displayName || e.symbolId
  }
  return map
}

export function createPriceSeries(chart, type) {
  // Always pane 0 (main price pane)
  if (type === 'line') {
    const series = chart.addSeries(
      LineSeries,
      {
        color: '#38bdf8',
        lineWidth: 2,
        priceLineVisible: false,
      },
      0,
    )
    series.priceScale().applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.05 },
      borderColor: '#2a3144',
    })
    return series
  }

  const series = chart.addSeries(
    CandlestickSeries,
    {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    },
    0,
  )
  series.priceScale().applyOptions({
    scaleMargins: { top: 0.08, bottom: 0.05 },
    borderColor: '#2a3144',
  })
  return series
}

/**
 * Ensure series sits on pane index (LWC may leave it on 0 if pane create races).
 * @param {import('lightweight-charts').ISeriesApi} series
 * @param {number} paneIndex
 */
export function ensureSeriesPane(series, paneIndex) {
  if (!series || typeof series.moveToPane !== 'function') return
  try {
    if (typeof series.paneIndex === 'function' && series.paneIndex() === paneIndex) {
      return
    }
    series.moveToPane(paneIndex)
  } catch {
    // ignore
  }
}

/**
 * After price series remove/recreate (e.g. candle↔line), LWC can collapse panes and
 * leave volume on pane 0. Re-pin volume series and restore heights.
 */
export function rebalancePriceVolumePanes(
  chart,
  priceSeries,
  volumeSeries,
  volumeSmaSeries,
  containerHeight,
) {
  if (!chart) return
  ensureSeriesPane(priceSeries, 0)
  ensureSeriesPane(volumeSeries, 1)
  ensureSeriesPane(volumeSmaSeries, 1)
  try {
    priceSeries?.priceScale()?.applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.05 },
      borderColor: '#2a3144',
    })
    volumeSeries?.priceScale()?.applyOptions({
      scaleMargins: { top: 0.12, bottom: 0 },
      borderColor: '#2a3144',
    })
  } catch {
    // ignore
  }
  applyVolumePaneHeight(chart, containerHeight)
}

/** Keep bar width stable after setData / fitContent / series swaps. */
export function applyBarSpacing(chart) {
  if (!chart) return
  try {
    chart.timeScale().applyOptions({
      barSpacing: BAR_SPACING,
      minBarSpacing: 2,
      rightOffset: 4,
    })
  } catch {
    // ignore
  }
}

/**
 * Volume histogram on a dedicated pane (index 1).
 * Do not use a custom priceScaleId — that attaches to the main pane overlay scale
 * and paints volume on top of price. Pane series use that pane's default right scale.
 * @returns {import('lightweight-charts').ISeriesApi<'Histogram'>}
 */
export function createVolumeSeries(chart) {
  const series = chart.addSeries(
    HistogramSeries,
    {
      priceFormat: { type: 'volume' },
      priceLineVisible: false,
      lastValueVisible: true,
      base: 0,
    },
    1,
  )
  ensureSeriesPane(series, 1)
  series.priceScale().applyOptions({
    scaleMargins: { top: 0.12, bottom: 0 },
    borderColor: '#2a3144',
  })
  return series
}

/**
 * Volume SMA on the same pane (1) and default scale as the histogram.
 * @returns {import('lightweight-charts').ISeriesApi<'Line'>}
 */
export function createVolumeSmaSeries(chart) {
  const series = chart.addSeries(
    LineSeries,
    {
      color: VOLUME_SMA_COLOR,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    },
    1,
  )
  ensureSeriesPane(series, 1)
  return series
}

/**
 * Locked volume pane height in px (ratio target, hard max/min).
 * @param {number} containerHeight
 */
export function volumePaneHeightPx(containerHeight) {
  if (!(containerHeight > 0)) return VOLUME_PANE_MAX_PX
  const fromRatio = Math.round(containerHeight * VOLUME_PANE_HEIGHT_RATIO)
  // Absolute max + never more than 22% of container.
  const hardMax = Math.min(VOLUME_PANE_MAX_PX, Math.floor(containerHeight * 0.22))
  return Math.min(hardMax, Math.max(VOLUME_PANE_MIN_PX, fromRatio))
}

/**
 * Size price + volume panes so volume cannot swallow the main chart.
 * Locks volume height (px + stretch factor) so candle↔line does not move the splitter.
 * @param {import('lightweight-charts').IChartApi} chart
 * @param {number} containerHeight
 */
export function applyVolumePaneHeight(chart, containerHeight) {
  if (!chart || !(containerHeight > 0)) return
  try {
    const panes = chart.panes()
    if (!panes || panes.length < 2) return
    const volHeight = volumePaneHeightPx(containerHeight)
    const priceHeight = Math.max(160, containerHeight - volHeight)
    panes[0].setHeight(priceHeight)
    panes[1].setHeight(volHeight)
    // Stretch factors keep the splitter stable when series types change.
    if (typeof panes[0].setStretchFactor === 'function') {
      panes[0].setStretchFactor(5)
      panes[1].setStretchFactor(1)
    }
  } catch {
    // panes API may throw if chart is mid-dispose
  }
}

/**
 * Map candles for LWC: sort by chart time, drop invalid OHLC, dedupe times.
 * Prevents setData() from failing / blank price pane after bad live bars.
 */
export function sanitizeSeriesPoints(type, candles) {
  const raw = mapSeriesData(type, candles || [])
  const byTime = new Map()
  for (const p of raw) {
    if (p == null || p.time == null || !Number.isFinite(Number(p.time))) continue
    if (type === 'line') {
      if (!Number.isFinite(Number(p.value))) continue
    } else {
      const o = Number(p.open)
      const h = Number(p.high)
      const l = Number(p.low)
      const c = Number(p.close)
      if (![o, h, l, c].every(Number.isFinite)) continue
    }
    byTime.set(p.time, p)
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time)
}

export function sanitizeVolumePoints(candles) {
  const raw = mapVolumeData(candles || [])
  const byTime = new Map()
  for (const p of raw) {
    if (p == null || p.time == null || !Number.isFinite(Number(p.time))) continue
    const v = Number(p.value)
    byTime.set(p.time, { ...p, value: Number.isFinite(v) ? Math.max(0, v) : 0 })
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time)
}

export function sanitizeVolumeSmaPoints(candles) {
  const raw = mapVolumeSmaData(candles || [])
  const byTime = new Map()
  for (const p of raw) {
    if (p == null || p.time == null || !Number.isFinite(Number(p.time))) continue
    if (!Number.isFinite(Number(p.value))) continue
    byTime.set(p.time, p)
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time)
}

export function defaultChartOptions() {
  return {
    layout: {
      background: { type: ColorType.Solid, color: '#0f1117' },
      textColor: '#94a3b8',
    },
    grid: {
      vertLines: { color: '#1e2433' },
      horzLines: { color: '#1e2433' },
    },
    rightPriceScale: {
      borderColor: '#2a3144',
    },
    timeScale: {
      borderColor: '#2a3144',
      timeVisible: true,
      secondsVisible: false,
      barSpacing: BAR_SPACING,
      minBarSpacing: 2,
    },
    crosshair: {
      vertLine: { color: '#475569' },
      horzLine: { color: '#475569' },
    },
  }
}

export function sortedCandlesFromMap(candlesMap) {
  return Array.from(candlesMap.values()).sort((a, b) => a.time - b.time)
}

export function seriesChartTimesFromCandles(candles) {
  return candles.map((c) => utcToNseChartTime(c.time))
}

/** Latest candle in the map, or null. */
export function latestCandleFromMap(candlesMap) {
  const candles = sortedCandlesFromMap(candlesMap)
  return candles.length ? candles[candles.length - 1] : null
}

/**
 * Find candle whose NSE chart time matches LWC crosshair time.
 * @param {Map<number, object>|Iterable} candlesMap
 * @param {number} chartTime LWC time (seconds, NSE-shifted)
 */
export function findCandleByChartTime(candlesMap, chartTime) {
  if (chartTime == null || !candlesMap) return null
  for (const candle of candlesMap.values()) {
    if (utcToNseChartTime(candle.time) === chartTime) {
      return candle
    }
  }
  return null
}

export function formatPrice(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Compact volume like TradingView (K / L / Cr for Indian scale feel). */
export function formatVolume(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)}L`
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`
  return String(Math.round(n))
}

export function isCandleUp(candle) {
  if (!candle) return true
  return Number(candle.close) >= Number(candle.open)
}

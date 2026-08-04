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

/** ATR subplot (between price and volume). */
export const ATR_PANE_HEIGHT_RATIO = 0.12
export const ATR_PANE_MAX_PX = 72
export const ATR_PANE_MIN_PX = 40

/** Matches backend breakout volume baseline (docs/indicators/volume-sma-20.md). */
export const VOLUME_SMA_PERIOD = 20

/** Matches backend `AtrIndicator.DEFAULT_PERIOD` / tip.pattern.atr-period. */
export const ATR_PERIOD = 14

const VOLUME_UP_COLOR = 'rgba(34, 197, 94, 0.5)'
const VOLUME_DOWN_COLOR = 'rgba(239, 68, 68, 0.5)'
/** Blue line on the volume pane: simple moving average of volume. */
export const VOLUME_SMA_COLOR = '#60a5fa'
/** Human-readable label for the volume SMA series. */
export const VOLUME_SMA_LABEL = `Vol SMA ${VOLUME_SMA_PERIOD}`

/** Amber line on the ATR pane (Wilder ATR). */
export const ATR_COLOR = '#fbbf24'
/** Human-readable label for the ATR series. */
export const ATR_LABEL = `ATR ${ATR_PERIOD}`

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

/**
 * True range for one bar vs previous close (Wilder / backend AtrIndicator).
 * @param {{ high: number, low: number }} bar
 * @param {number} previousClose
 */
export function trueRange(bar, previousClose) {
  const high = Number(bar.high)
  const low = Number(bar.low)
  const prev = Number(previousClose)
  if (![high, low, prev].every(Number.isFinite)) return NaN
  const hl = high - low
  const hc = Math.abs(high - prev)
  const lc = Math.abs(low - prev)
  return Math.max(hl, hc, lc)
}

/**
 * Wilder ATR series. First point after period+1 bars (same as backend AtrIndicator).
 * @param {Array<{ time: number, high: number, low: number, close: number }>} candles sorted ascending
 * @param {number} [period=ATR_PERIOD]
 * @returns {Array<{ time: number, value: number }>}
 */
export function mapAtrData(candles, period = ATR_PERIOD) {
  const list = candles || []
  if (period < 1 || list.length < period + 1) return []

  const points = []
  let atr = 0
  for (let i = 1; i <= period; i++) {
    const tr = trueRange(list[i], list[i - 1].close)
    if (!Number.isFinite(tr)) return []
    atr += tr
  }
  atr /= period
  points.push({
    time: utcToNseChartTime(list[period].time),
    value: atr,
  })

  for (let i = period + 1; i < list.length; i++) {
    const tr = trueRange(list[i], list[i - 1].close)
    if (!Number.isFinite(tr)) continue
    atr = (atr * (period - 1) + tr) / period
    points.push({
      time: utcToNseChartTime(list[i].time),
      value: atr,
    })
  }
  return points
}

/**
 * Last Wilder ATR point for live updates (same formula as {@link mapAtrData}).
 * @returns {{ time: number, value: number } | null}
 */
export function lastAtrPoint(candles, period = ATR_PERIOD) {
  const pts = mapAtrData(candles, period)
  return pts.length ? pts[pts.length - 1] : null
}

/**
 * Latest ATR value only (parity helper / legend).
 * @returns {number | null}
 */
export function latestAtrValue(candles, period = ATR_PERIOD) {
  const pt = lastAtrPoint(candles, period)
  return pt ? pt.value : null
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
 * Apply series visibility for ATR / volume subpanes.
 * @param {{ atr?: object|null, volume?: object|null, volumeSma?: object|null }} series
 * @param {{ showAtr?: boolean, showVolume?: boolean }} opts
 */
export function applySubpaneVisibility(series, opts = {}) {
  const showAtr = opts.showAtr !== false
  const showVolume = opts.showVolume !== false
  try {
    series?.atr?.applyOptions?.({ visible: showAtr, lastValueVisible: showAtr })
  } catch {
    // ignore
  }
  try {
    series?.volume?.applyOptions?.({ visible: showVolume, lastValueVisible: showVolume })
  } catch {
    // ignore
  }
  try {
    series?.volumeSma?.applyOptions?.({
      visible: showVolume,
      lastValueVisible: false,
    })
  } catch {
    // ignore
  }
}

/**
 * After price series remove/recreate (e.g. candle↔line), LWC can collapse panes.
 * Re-pin price / ATR / volume and restore heights.
 * Pane layout: 0 = price, 1 = ATR, 2 = volume (+ SMA).
 * @param {{ showAtr?: boolean, showVolume?: boolean }} [visibility]
 */
export function rebalancePriceVolumePanes(
  chart,
  priceSeries,
  volumeSeries,
  volumeSmaSeries,
  containerHeight,
  atrSeries = null,
  visibility = {},
) {
  if (!chart) return
  ensureSeriesPane(priceSeries, 0)
  if (atrSeries) ensureSeriesPane(atrSeries, 1)
  ensureSeriesPane(volumeSeries, 2)
  ensureSeriesPane(volumeSmaSeries, 2)
  try {
    priceSeries?.priceScale()?.applyOptions({
      scaleMargins: { top: 0.08, bottom: 0.05 },
      borderColor: '#2a3144',
    })
    atrSeries?.priceScale()?.applyOptions({
      scaleMargins: { top: 0.15, bottom: 0.1 },
      borderColor: '#2a3144',
    })
    volumeSeries?.priceScale()?.applyOptions({
      scaleMargins: { top: 0.12, bottom: 0 },
      borderColor: '#2a3144',
    })
  } catch {
    // ignore
  }
  applySubpaneVisibility(
    { atr: atrSeries, volume: volumeSeries, volumeSma: volumeSmaSeries },
    visibility,
  )
  applyVolumePaneHeight(chart, containerHeight, visibility)
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
 * Volume histogram on pane 2 (below ATR).
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
    2,
  )
  ensureSeriesPane(series, 2)
  series.priceScale().applyOptions({
    scaleMargins: { top: 0.12, bottom: 0 },
    borderColor: '#2a3144',
  })
  return series
}

/**
 * Volume SMA on the same pane (2) and default scale as the histogram.
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
    2,
  )
  ensureSeriesPane(series, 2)
  return series
}

/**
 * Wilder ATR line on pane 1 (between price and volume).
 * @returns {import('lightweight-charts').ISeriesApi<'Line'>}
 */
export function createAtrSeries(chart) {
  const series = chart.addSeries(
    LineSeries,
    {
      color: ATR_COLOR,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      title: ATR_LABEL,
    },
    1,
  )
  ensureSeriesPane(series, 1)
  series.priceScale().applyOptions({
    scaleMargins: { top: 0.15, bottom: 0.1 },
    borderColor: '#2a3144',
  })
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
 * Locked ATR pane height in px (ratio target, hard max/min).
 * @param {number} containerHeight
 */
export function atrPaneHeightPx(containerHeight) {
  if (!(containerHeight > 0)) return ATR_PANE_MAX_PX
  const fromRatio = Math.round(containerHeight * ATR_PANE_HEIGHT_RATIO)
  const hardMax = Math.min(ATR_PANE_MAX_PX, Math.floor(containerHeight * 0.16))
  return Math.min(hardMax, Math.max(ATR_PANE_MIN_PX, fromRatio))
}

/**
 * Size price + ATR + volume panes so subpanes cannot swallow the main chart.
 * Locks heights (px + stretch factors) so candle↔line does not move splitters.
 * Hidden panes get height 0 (series should also be set visible:false).
 * @param {import('lightweight-charts').IChartApi} chart
 * @param {number} containerHeight
 * @param {{ showAtr?: boolean, showVolume?: boolean }} [opts]
 */
export function applyVolumePaneHeight(chart, containerHeight, opts = {}) {
  if (!chart || !(containerHeight > 0)) return
  const showAtr = opts.showAtr !== false
  const showVolume = opts.showVolume !== false
  try {
    const panes = chart.panes()
    if (!panes || panes.length < 2) return

    // 3-pane layout: price | ATR | volume
    if (panes.length >= 3) {
      let atrHeight = showAtr ? atrPaneHeightPx(containerHeight) : 0
      let volHeight = showVolume ? volumePaneHeightPx(containerHeight) : 0
      const minPrice = 140
      if (atrHeight + volHeight + minPrice > containerHeight) {
        const budget = Math.max(0, containerHeight - minPrice)
        const total = atrHeight + volHeight || 1
        atrHeight = Math.floor((budget * atrHeight) / total)
        volHeight = Math.max(0, budget - atrHeight)
      }
      const priceHeight = Math.max(minPrice, containerHeight - atrHeight - volHeight)
      panes[0].setHeight(priceHeight)
      panes[1].setHeight(atrHeight)
      panes[2].setHeight(volHeight)
      if (typeof panes[0].setStretchFactor === 'function') {
        panes[0].setStretchFactor(5)
        panes[1].setStretchFactor(showAtr ? 1 : 0.001)
        panes[2].setStretchFactor(showVolume ? 1 : 0.001)
      }
      return
    }

    // Fallback: price + single subpane (legacy / partial mount)
    const subVisible = showVolume || showAtr
    const volHeight = subVisible ? volumePaneHeightPx(containerHeight) : 0
    const priceHeight = Math.max(160, containerHeight - volHeight)
    panes[0].setHeight(priceHeight)
    panes[1].setHeight(volHeight)
    if (typeof panes[0].setStretchFactor === 'function') {
      panes[0].setStretchFactor(5)
      panes[1].setStretchFactor(subVisible ? 1 : 0.001)
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

export function sanitizeAtrPoints(candles, period = ATR_PERIOD) {
  const raw = mapAtrData(candles || [], period)
  const byTime = new Map()
  for (const p of raw) {
    if (p == null || p.time == null || !Number.isFinite(Number(p.time))) continue
    if (!Number.isFinite(Number(p.value)) || p.value < 0) continue
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

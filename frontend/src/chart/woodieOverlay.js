import {
  WOODIE_LEVEL_COLORS,
  WOODIE_LEVEL_KEYS,
  WOODIE_LEVEL_LABELS,
  buildSessionSegments,
  filterSegmentsTodayOnly,
} from '../utils/woodieSr'

export function createWoodieHandles() {
  return { primitive: null, histSeries: [], priceLines: [] }
}

function timeToX(ts, time) {
  const exact = ts.timeToCoordinate(time)
  if (exact != null && Number.isFinite(exact)) return exact
  const idx = ts.timeToIndex(time, true)
  if (idx == null) return null
  const x = ts.indexToCoordinate(idx)
  return x == null || !Number.isFinite(x) ? null : x
}

class WoodieAxisView {
  constructor(owner, key) {
    this._owner = owner
    this._key = key
  }
  coordinate() {
    const series = this._owner._series
    const last = this._owner._segments[this._owner._segments.length - 1]
    const price = last?.prices?.[this._key]
    if (!series || price == null) return -10000
    const y = series.priceToCoordinate(price)
    return y == null ? -10000 : y
  }
  text() {
    return WOODIE_LEVEL_LABELS[this._key]
  }
  textColor() {
    return '#0f1117'
  }
  backColor() {
    return WOODIE_LEVEL_COLORS[this._key]
  }
}

class WoodieRenderer {
  constructor(owner) {
    this._owner = owner
  }
  draw(target) {
    const chart = this._owner._chart
    const series = this._owner._series
    const segments = this._owner._segments
    if (!chart || !series || !segments.length) return
    const ts = chart.timeScale()
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context
      const hpr = scope.horizontalPixelRatio
      const vpr = scope.verticalPixelRatio
      const barW = (ts.options().barSpacing || 6) * hpr
      ctx.save()
      ctx.lineWidth = Math.max(1, Math.round(vpr))
      ctx.setLineDash([6 * hpr, 4 * hpr])
      ctx.lineCap = 'butt'
      for (const seg of segments) {
        let x1 = timeToX(ts, seg.start)
        let x2 = timeToX(ts, seg.end)
        if (x1 == null && x2 == null) continue
        if (x1 == null) x1 = 0
        if (x2 == null) x2 = ts.width()
        let left = Math.min(x1, x2) * hpr
        let right = Math.max(x1, x2) * hpr
        if (right - left < 2) {
          const hw = Math.max(barW * 0.45, 3)
          left -= hw
          right += hw
        }
        for (const key of WOODIE_LEVEL_KEYS) {
          const price = seg.prices[key]
          if (price == null) continue
          const yMedia = series.priceToCoordinate(price)
          if (yMedia == null) continue
          const y = Math.round(yMedia * vpr) + (ctx.lineWidth % 2 ? 0.5 : 0)
          ctx.strokeStyle = WOODIE_LEVEL_COLORS[key]
          ctx.beginPath()
          ctx.moveTo(left, y)
          ctx.lineTo(right, y)
          ctx.stroke()
        }
      }
      ctx.restore()
    })
  }
}

class WoodiePaneView {
  constructor(owner) {
    this._owner = owner
    this._renderer = new WoodieRenderer(owner)
  }
  zOrder() {
    return 'normal'
  }
  renderer() {
    return this._renderer
  }
}

class WoodieSrPrimitive {
  constructor() {
    this._segments = []
    this._chart = null
    this._series = null
    this._requestUpdate = null
    this._paneView = new WoodiePaneView(this)
    this._axisViews = WOODIE_LEVEL_KEYS.map((key) => new WoodieAxisView(this, key))
  }
  attached(param) {
    this._chart = param.chart
    this._series = param.series
    this._requestUpdate = param.requestUpdate
  }
  detached() {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }
  setSegments(segments) {
    this._segments = segments || []
    this._requestUpdate?.()
  }
  paneViews() {
    return [this._paneView]
  }
  updateAllViews() {}
  priceAxisViews() {
    return this._axisViews
  }
}

function detachPrimitive(series, primitive) {
  if (!series || !primitive) return
  try {
    series.detachPrimitive(primitive)
  } catch {
    // ignore
  }
}

/**
 * Frozen Woodie ladders as true horizontal session spans (canvas primitive).
 * Not a LineSeries — LWC would otherwise connect yesterday’s close to today’s open.
 */
export function applyWoodieOverlay(
  chart,
  series,
  days,
  { candles, todayOnly = false, todayYmd = '', ctsHour, ctsMinute } = {},
  handles,
) {
  const h = handles || createWoodieHandles()
  if (!series) {
    clearWoodieOverlay(chart, series, h)
    return h
  }
  if (h.primitive && h.primitive._series && h.primitive._series !== series) {
    detachPrimitive(h.primitive._series, h.primitive)
    h.primitive = null
  }
  if (!h.primitive) {
    h.primitive = new WoodieSrPrimitive()
    try {
      series.attachPrimitive(h.primitive)
    } catch {
      h.primitive = null
      return h
    }
  }
  let segs = buildSessionSegments(days, candles, { hour: ctsHour, minute: ctsMinute })
  if (todayOnly) segs = filterSegmentsTodayOnly(segs, todayYmd)
  h.primitive.setSegments(segs)
  return h
}

export function clearWoodieOverlay(chart, series, handles) {
  const h = handles || createWoodieHandles()
  if (h.primitive) {
    detachPrimitive(h.primitive._series || series, h.primitive)
    h.primitive = null
  }
  if (series && Array.isArray(h.priceLines)) {
    for (const pl of h.priceLines) {
      try {
        series.removePriceLine(pl)
      } catch {
        // ignore
      }
    }
  }
  h.priceLines = []
  if (chart && Array.isArray(h.histSeries)) {
    for (const s of h.histSeries) {
      try {
        chart.removeSeries(s)
      } catch {
        // ignore
      }
    }
  }
  h.histSeries = []
}

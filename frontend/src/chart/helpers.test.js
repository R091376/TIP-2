import { describe, expect, it } from 'vitest'
import {
  atrPaneHeightPx,
  lastAtrPoint,
  latestAtrValue,
  mapAtrData,
  normalizeStatus,
  resolveDisplayStatus,
  sanitizeAtrPoints,
  sanitizeSeriesPoints,
  sanitizeVolumePoints,
  sanitizeVolumeSmaPoints,
  trueRange,
  volumePaneHeightPx,
} from './helpers'

function candle(time, ohlc = {}, volume = 100) {
  return {
    time,
    open: ohlc.open ?? 10,
    high: ohlc.high ?? 12,
    low: ohlc.low ?? 9,
    close: ohlc.close ?? 11,
    volume,
  }
}

/** Matches backend tests/indicators/test_atr.py _bars pattern. */
function atrBars(n = 20) {
  const out = []
  let price = 100
  for (let i = 0; i < n; i++) {
    const o = price
    const h = price + 2
    const l = price - 1
    const c = price + 0.5
    out.push(candle(i + 1, { open: o, high: h, low: l, close: c }))
    price = c
  }
  return out
}

describe('normalizeStatus / resolveDisplayStatus', () => {
  it('normalizes bootstrap status', () => {
    expect(normalizeStatus('ready')).toBe('READY')
    expect(normalizeStatus(null)).toBe('')
  })

  it('prefers market closed over live ws status', () => {
    expect(resolveDisplayStatus('connected', 'closed')).toBe('market_closed')
    expect(resolveDisplayStatus('connected', 'pre_open')).toBe('pre_open')
    expect(resolveDisplayStatus('connected', 'open')).toBe('connected')
    expect(resolveDisplayStatus('error', 'open')).toBe('error')
  })
})

describe('sanitizeSeriesPoints', () => {
  it('drops non-finite OHLC, dedupes by chart time, sorts ascending', () => {
    const candles = [
      candle(20),
      candle(10, { open: NaN }),
      candle(30),
      candle(20, { close: 15 }), // duplicate source time keeps last
    ]
    const pts = sanitizeSeriesPoints('candlestick', candles)
    expect(pts).toHaveLength(2)
    expect(pts[0].time).toBeLessThan(pts[1].time)
    expect(pts[0].close).toBe(15)
  })

  it('sanitizes line series values', () => {
    const candles = [candle(1, { close: 100 }), candle(2, { close: NaN })]
    const pts = sanitizeSeriesPoints('line', candles)
    expect(pts).toHaveLength(1)
    expect(pts[0].value).toBe(100)
  })
})

describe('sanitizeVolumePoints / sanitizeVolumeSmaPoints', () => {
  it('clamps bad volume to 0', () => {
    const pts = sanitizeVolumePoints([candle(1, {}, NaN), candle(2, {}, 50)])
    expect(pts).toHaveLength(2)
    expect(pts[0].value).toBe(0)
    expect(pts[1].value).toBe(50)
  })

  it('builds SMA only when finite', () => {
    const candles = Array.from({ length: 25 }, (_, i) => candle(i + 1, {}, 100 + i))
    const sma = sanitizeVolumeSmaPoints(candles)
    expect(sma.length).toBeGreaterThan(0)
    expect(sma.every((p) => Number.isFinite(p.value))).toBe(true)
  })
})

describe('trueRange / mapAtrData (Wilder ATR)', () => {
  it('trueRange uses max of HL, |H-prevC|, |L-prevC|', () => {
    // HL=6, HC=5, LC=1 → 6
    expect(trueRange({ high: 105, low: 99 }, 100)).toBe(6)
    // gap up: HL=2, HC=8, LC=6 → 8
    expect(trueRange({ high: 110, low: 108 }, 102)).toBe(8)
  })

  it('requires period + 1 bars (matches backend AtrIndicator)', () => {
    expect(mapAtrData(atrBars(14), 14)).toEqual([])
    expect(latestAtrValue(atrBars(14), 14)).toBeNull()
    const pts = mapAtrData(atrBars(15), 14)
    expect(pts).toHaveLength(1)
    expect(pts[0].value).toBeGreaterThan(0)
  })

  it('toy period-3 first ATR matches Learn example (TR 6,4,7 → 5.67)', () => {
    // Learn atr-14: prior close 100; bars with TR 6, 4, 7
    const bars = [
      candle(1, { open: 100, high: 100, low: 100, close: 100 }),
      candle(2, { open: 100, high: 105, low: 99, close: 103 }),
      candle(3, { open: 103, high: 104, low: 100, close: 101 }),
      candle(4, { open: 101, high: 108, low: 102, close: 107 }),
    ]
    const pts = mapAtrData(bars, 3)
    expect(pts).toHaveLength(1)
    expect(pts[0].value).toBeCloseTo(17 / 3, 10)
  })

  it('Wilder smooth after first window', () => {
    const bars = [
      candle(1, { open: 100, high: 100, low: 100, close: 100 }),
      candle(2, { open: 100, high: 105, low: 99, close: 103 }),
      candle(3, { open: 103, high: 104, low: 100, close: 101 }),
      candle(4, { open: 101, high: 108, low: 102, close: 107 }),
      // TR5 = max(3, |109-107|, |106-107|) = max(3, 2, 1) = 3
      candle(5, { open: 107, high: 109, low: 106, close: 108 }),
    ]
    const pts = mapAtrData(bars, 3)
    expect(pts).toHaveLength(2)
    const first = 17 / 3
    const second = (first * 2 + 3) / 3
    expect(pts[0].value).toBeCloseTo(first, 10)
    expect(pts[1].value).toBeCloseTo(second, 10)
  })

  it('backend-style bars: latest ATR positive and stable', () => {
    const atr = latestAtrValue(atrBars(30), 14)
    expect(atr).not.toBeNull()
    expect(atr).toBeGreaterThan(0)
    // Constant TR ≈ 3 on this synthetic path → ATR near 3
    expect(atr).toBeCloseTo(3, 5)
  })

  it('lastAtrPoint matches series tail; sanitize drops non-finite', () => {
    const bars = atrBars(20)
    const last = lastAtrPoint(bars, 14)
    const series = sanitizeAtrPoints(bars, 14)
    expect(last).not.toBeNull()
    expect(series[series.length - 1].value).toBe(last.value)
    expect(series.every((p) => Number.isFinite(p.value) && p.value >= 0)).toBe(true)
  })

  it('subpane height helpers stay within caps', () => {
    expect(atrPaneHeightPx(500)).toBeLessThanOrEqual(72)
    expect(atrPaneHeightPx(500)).toBeGreaterThanOrEqual(40)
    expect(volumePaneHeightPx(500)).toBeLessThanOrEqual(96)
    expect(volumePaneHeightPx(500)).toBeGreaterThanOrEqual(52)
  })
})

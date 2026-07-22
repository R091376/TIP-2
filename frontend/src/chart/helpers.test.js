import { describe, expect, it } from 'vitest'
import {
  normalizeStatus,
  resolveDisplayStatus,
  sanitizeSeriesPoints,
  sanitizeVolumePoints,
  sanitizeVolumeSmaPoints,
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

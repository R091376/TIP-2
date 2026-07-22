import { describe, expect, it } from 'vitest'
import {
  collectInstanceEvents,
  nearestInSorted,
  seriesKey,
  stageColors,
  stageShortLabel,
  willRestoreOverlay,
} from './patternOverlay'

describe('seriesKey', () => {
  it('joins symbol and timeframe', () => {
    expect(seriesKey('NSE:RELIANCE', '5m')).toBe('NSE:RELIANCE|5m')
  })

  it('returns null when missing parts', () => {
    expect(seriesKey(null, '5m')).toBeNull()
    expect(seriesKey('NSE:RELIANCE', null)).toBeNull()
    expect(seriesKey('', '5m')).toBeNull()
  })
})

describe('stageColors / stageShortLabel', () => {
  it('maps known stages', () => {
    expect(stageColors('succeeded').line).toBe('#22c55e')
    expect(stageShortLabel('succeeded')).toBe('WIN')
    expect(stageShortLabel('detected')).toBe('DET')
    expect(stageShortLabel('unknown')).toBe('EVT')
  })
})

describe('nearestInSorted', () => {
  const times = [10, 20, 30, 40, 50]

  it('returns null for empty / invalid', () => {
    expect(nearestInSorted([], 10)).toBeNull()
    expect(nearestInSorted(times, null)).toBeNull()
    expect(nearestInSorted(times, NaN)).toBeNull()
  })

  it('clamps to ends', () => {
    expect(nearestInSorted(times, 0)).toEqual({ value: 10, index: 0 })
    expect(nearestInSorted(times, 100)).toEqual({ value: 50, index: 4 })
  })

  it('finds exact and nearest', () => {
    expect(nearestInSorted(times, 30)).toEqual({ value: 30, index: 2 })
    expect(nearestInSorted(times, 24)?.value).toBe(20)
    expect(nearestInSorted(times, 26)?.value).toBe(30)
  })
})

describe('collectInstanceEvents', () => {
  it('filters and sorts by time then stage order', () => {
    const alerts = [
      { id: '3', instanceId: 'i1', time: 20, stage: 'confirmed' },
      { id: '1', instanceId: 'i1', time: 10, stage: 'detected' },
      { id: 'x', instanceId: 'other', time: 15, stage: 'detected' },
      { id: '2', instanceId: 'i1', time: 10, stage: 'confirmed' },
    ]
    const out = collectInstanceEvents(alerts, 'i1')
    expect(out.map((a) => a.id)).toEqual(['1', '2', '3'])
  })
})

describe('willRestoreOverlay', () => {
  it('true when pending matches series', () => {
    expect(
      willRestoreOverlay(
        { symbolId: 'A', timeframe: '5m' },
        null,
        'A',
        '5m',
      ),
    ).toBe(true)
  })

  it('true when memory focus exists', () => {
    expect(willRestoreOverlay(null, { id: 'x' }, 'A', '5m')).toBe(true)
  })

  it('false otherwise', () => {
    expect(
      willRestoreOverlay({ symbolId: 'B', timeframe: '5m' }, null, 'A', '5m'),
    ).toBe(false)
  })
})

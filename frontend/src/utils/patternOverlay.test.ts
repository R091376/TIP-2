import { describe, expect, it, vi } from 'vitest'
import { utcToNseChartTime } from './chartTime'
import {
  applyInstanceOverlay,
  clearPatternOverlay,
  collectInstanceEvents,
  findAlertAtChartTime,
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

describe('findAlertAtChartTime', () => {
  it('returns alert on the exact series bar only', () => {
    const t1 = 1_700_000_000
    const t2 = 1_700_000_300
    const c1 = utcToNseChartTime(t1)
    const c2 = utcToNseChartTime(t2)
    const series = [c1, c2]
    const alerts = [
      { id: 'a', instanceId: 'i1', symbolId: 'S', timeframe: '5m', time: t1, stage: 'detected' },
      { id: 'b', instanceId: 'i2', symbolId: 'S', timeframe: '5m', time: t2, stage: 'detected' },
      { id: 'c', instanceId: 'i3', symbolId: 'OTHER', timeframe: '5m', time: t1, stage: 'detected' },
    ]
    const hit = findAlertAtChartTime(alerts, c1, {
      symbolId: 'S',
      timeframe: '5m',
      seriesChartTimes: series,
    })
    expect(hit?.id).toBe('a')
  })

  it('prefers focused instance when provided', () => {
    const t = 1_700_000_000
    const ct = utcToNseChartTime(t)
    const alerts = [
      { id: 'a', instanceId: 'i1', symbolId: 'S', timeframe: '5m', time: t, stage: 'detected' },
      { id: 'b', instanceId: 'i2', symbolId: 'S', timeframe: '5m', time: t, stage: 'confirmed' },
    ]
    const hit = findAlertAtChartTime(alerts, ct, {
      symbolId: 'S',
      timeframe: '5m',
      preferredInstanceId: 'i2',
      seriesChartTimes: [ct],
    })
    expect(hit?.instanceId).toBe('i2')
  })

  it('returns null when click is not on an alert bar', () => {
    const tAlert = 1_700_000_000
    const tOther = 1_700_000_300
    const cAlert = utcToNseChartTime(tAlert)
    const cOther = utcToNseChartTime(tOther)
    const alerts = [
      {
        id: 'a',
        instanceId: 'i1',
        symbolId: 'S',
        timeframe: '5m',
        time: tAlert,
        stage: 'detected',
      },
    ]
    expect(
      findAlertAtChartTime(alerts, cOther, {
        symbolId: 'S',
        timeframe: '5m',
        seriesChartTimes: [cAlert, cOther],
      }),
    ).toBeNull()
  })

  it('respects markerChartTimes gate', () => {
    const t = 1_700_000_000
    const ct = utcToNseChartTime(t)
    const alerts = [
      { id: 'a', instanceId: 'i1', symbolId: 'S', timeframe: '5m', time: t, stage: 'detected' },
    ]
    expect(
      findAlertAtChartTime(alerts, ct, {
        symbolId: 'S',
        timeframe: '5m',
        seriesChartTimes: [ct],
        markerChartTimes: [],
      }),
    ).toBeNull()
    expect(
      findAlertAtChartTime(alerts, ct, {
        symbolId: 'S',
        timeframe: '5m',
        seriesChartTimes: [ct],
        markerChartTimes: [ct],
      })?.id,
    ).toBe('a')
  })
})

vi.mock('lightweight-charts', () => ({
  LineStyle: { Dashed: 2, Solid: 0 },
  createSeriesMarkers: () => ({ setMarkers: vi.fn(), detach: vi.fn() }),
}))

function fakeSeries() {
  return {
    createPriceLine: () => ({}),
    removePriceLine: vi.fn(),
  }
}

function fakeChart() {
  const setData = vi.fn()
  return {
    addLineSeries: vi.fn(() => ({ setData })),
    removeSeries: vi.fn(),
    setData,
  }
}

const event = {
  id: 'e1',
  instanceId: 'i1',
  time: 1_700_000_000,
  stage: 'detected',
  symbolId: 'S',
  timeframe: '15m',
  patternType: 'head_shoulders',
  direction: 'short',
  referenceLevel: 103.2,
  price: 102.8,
}

describe('applyInstanceOverlay classical geometry', () => {
  it('does not throw when geometry is missing', () => {
    const handle = applyInstanceOverlay(fakeSeries(), fakeChart(), {
      events: [event],
      focusAlert: event,
      rails: { reference: 103.2, entry: 102.8, stop: 110, target: 90 },
    })
    expect(handle).toBeTruthy()
    expect(handle?.extraSeries?.length ?? 0).toBe(0)
  })

  it('adds a sloped neckline series from geometry', () => {
    const chart = fakeChart()
    const handle = applyInstanceOverlay(fakeSeries(), chart, {
      events: [event],
      focusAlert: event,
      geometry: {
        kind: 'head_shoulders',
        neckline: {
          style: 'sloped',
          p1Time: 1_700_000_000,
          p1Price: 104,
          p2Time: 1_700_000_060,
          p2Price: 103.5,
          priceAtBreak: 103.2,
        },
        breakTime: 1_700_000_120,
        pivots: [
          { role: 'head', time: 1_700_000_060, price: 116, high: true },
        ],
      },
    })
    expect(chart.addLineSeries).toHaveBeenCalled()
    expect(handle?.extraSeries?.length).toBe(1)
    clearPatternOverlay(handle)
    expect(chart.removeSeries).toHaveBeenCalled()
  })
})

import { describe, expect, it } from 'vitest'
import {
  CAS_AS_OF,
  buildSessionSegments,
  clipSegmentEnd,
  computeWoodieOpenV1,
  effectiveCtsForDate,
  filterSegmentsTodayOnly,
  nseSessionUtcSeconds,
  pickActiveSessionDate,
  type WoodieDayLevels,
} from './woodieSr'
import { utcToNseChartTime } from './chartTime'

function day(sessionDate: string, pp: number): WoodieDayLevels {
  return {
    sessionDate,
    pp,
    s3: pp - 3,
    s2: pp - 2,
    s1: pp - 1,
    r1: pp + 1,
    r2: pp + 2,
    r3: pp + 3,
  }
}

describe('nseSessionUtcSeconds', () => {
  it('maps 09:15 IST to 03:45 UTC', () => {
    expect(nseSessionUtcSeconds('2026-08-17', 9, 15)).toBe(
      Date.UTC(2026, 7, 17, 3, 45, 0) / 1000,
    )
  })

  it('maps 15:30 IST to 10:00 UTC', () => {
    expect(nseSessionUtcSeconds('2026-08-17', 15, 30)).toBe(
      Date.UTC(2026, 7, 17, 10, 0, 0) / 1000,
    )
  })
})

describe('pickActiveSessionDate', () => {
  it('prefers today when present', () => {
    const days = [day('2026-08-14', 100), day('2026-08-17', 110)]
    expect(pickActiveSessionDate(days, '2026-08-17')).toBe('2026-08-17')
  })

  it('falls back to the latest frozen session', () => {
    const days = [day('2026-08-13', 90), day('2026-08-14', 100)]
    expect(pickActiveSessionDate(days, '2026-08-17')).toBe('2026-08-14')
  })
})

describe('buildSessionSegments', () => {
  it('computes missing frozen days from previous session OHLC', () => {
    const t1 = nseSessionUtcSeconds('2026-08-14', 9, 15)
    const t2 = nseSessionUtcSeconds('2026-08-17', 9, 15)
    const segs = buildSessionSegments(
      [],
      [
        { time: t1, open: 10, high: 12, low: 10, close: 11 },
        { time: t2, open: 11.5, high: 12, low: 11, close: 11.8 },
      ],
    )
    expect(segs).toHaveLength(1)
    expect(segs[0].sessionDate).toBe('2026-08-17')
    const w = computeWoodieOpenV1(12, 10, 11, 11.5)
    expect(segs[0].prices.pp).toBe(w?.pp)
    expect(segs[0].prices.s2).toBe(w?.s2)
  })

  it('snaps each day to first/last candle of that IST date', () => {
    const days = [day('2026-08-14', 100), day('2026-08-17', 110)]
    const t14a = nseSessionUtcSeconds('2026-08-14', 9, 15)
    const t14b = nseSessionUtcSeconds('2026-08-14', 15, 25)
    const t17a = nseSessionUtcSeconds('2026-08-17', 9, 15)
    const t17b = nseSessionUtcSeconds('2026-08-17', 10, 15)
    const segs = buildSessionSegments(days, [
      { time: t14a },
      { time: t14b },
      { time: t17a },
      { time: t17b },
    ])
    expect(segs).toHaveLength(2)
    expect(segs[0].sessionDate).toBe('2026-08-14')
    expect(segs[0].prices.s2).toBe(98)
    expect(segs[1].prices.s2).toBe(108)
    expect(segs[0].start).toBe(utcToNseChartTime(t14a))
    expect(segs[0].end).toBe(
      utcToNseChartTime(nseSessionUtcSeconds('2026-08-14', 15, 30)),
    )
    expect(segs[1].start).toBe(utcToNseChartTime(t17a))
    expect(segs[1].end).toBe(
      utcToNseChartTime(nseSessionUtcSeconds('2026-08-17', 15, 30)),
    )
  })

  it('clips CAS days to 15:15 and pre-as_of days to 15:30', () => {
    expect(CAS_AS_OF).toBe('2026-08-03')
    expect(effectiveCtsForDate('2026-07-10', 15, 15)).toEqual({
      hour: 15,
      minute: 30,
    })
    expect(effectiveCtsForDate('2026-08-03', 15, 15)).toEqual({
      hour: 15,
      minute: 15,
    })
    const tLast = nseSessionUtcSeconds('2026-08-17', 15, 10)
    const days = [day('2026-08-17', 110)]
    const segs = buildSessionSegments(
      days,
      [{ time: nseSessionUtcSeconds('2026-08-17', 9, 15) }, { time: tLast }],
      { hour: 15, minute: 15 },
    )
    expect(segs[0].end).toBe(
      clipSegmentEnd(utcToNseChartTime(tLast), '2026-08-17', 15, 15),
    )
    expect(segs[0].end).toBe(
      utcToNseChartTime(nseSessionUtcSeconds('2026-08-17', 15, 15)),
    )
  })
})

describe('filterSegmentsTodayOnly', () => {
  it('keeps only the IST today session when present', () => {
    const segs = [
      { sessionDate: '2026-08-14', start: 1, end: 2, prices: { pp: 1 } },
      { sessionDate: '2026-08-17', start: 3, end: 4, prices: { pp: 2 } },
    ]
    expect(filterSegmentsTodayOnly(segs, '2026-08-17').map((s) => s.sessionDate)).toEqual([
      '2026-08-17',
    ])
  })

  it('falls back to the latest session if today has no row', () => {
    const segs = [
      { sessionDate: '2026-08-13', start: 1, end: 2, prices: { pp: 1 } },
      { sessionDate: '2026-08-14', start: 3, end: 4, prices: { pp: 2 } },
    ]
    expect(filterSegmentsTodayOnly(segs, '2026-08-17').map((s) => s.sessionDate)).toEqual([
      '2026-08-14',
    ])
  })
})

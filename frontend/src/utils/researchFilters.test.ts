import { describe, expect, it } from 'vitest'
import {
  parseResearchFiltersFromSearch,
  serializeResearchFilters,
  researchEarliestDetectYmd,
  researchFilterChips,
  todayIstYmd,
} from './researchFilters'

describe('researchFilters codec', () => {
  it('round-trips groupBy with commas without CSV-splitting', () => {
    const qs = serializeResearchFilters({
      groupBy: 'symbol,patternType,timeframe',
      patternType: ['breakout', 'breakdown'],
      flagRetested: true,
    })
    const sp = new URLSearchParams(qs)
    expect(sp.get('groupBy')).toBe('symbol,patternType,timeframe')
    expect(sp.get('patternType')).toBe('breakout,breakdown')
    const parsed = parseResearchFiltersFromSearch(qs)
    expect(parsed.groupBy).toBe('symbol,patternType,timeframe')
    expect(parsed.patternType).toEqual(['breakout', 'breakdown'])
    expect(parsed.flagRetested).toBe(true)
  })

  it('builds chips for session stack', () => {
    const chips = researchFilterChips({
      flagRetested: true,
      volumeOkAtDetect: true,
      detectTimeIstStart: '09:30',
      detectTimeIstEnd: '15:00',
    })
    expect(chips.some((c) => c.key === 'flagRetested')).toBe(true)
    expect(chips.some((c) => c.key === 'tod')).toBe(true)
  })

  it('round-trips minRiskR / maxRiskR and chips', () => {
    const qs = serializeResearchFilters({
      flagConfirmed: true,
      minPlannedRr: 1.5,
      minRiskR: 0.5,
      maxRiskR: 2.0,
      resolvedOnly: true,
    })
    const parsed = parseResearchFiltersFromSearch(qs)
    expect(parsed.minRiskR).toBe(0.5)
    expect(parsed.maxRiskR).toBe(2.0)
    expect(parsed.minPlannedRr).toBe(1.5)
    const chips = researchFilterChips(parsed)
    expect(chips.some((c) => c.key === 'minRiskR' && c.label.includes('0.5'))).toBe(true)
    expect(chips.some((c) => c.key === 'maxRiskR' && c.label.includes('2'))).toBe(true)
  })

  it('drops non-finite rails numbers from URL parse', () => {
    const parsed = parseResearchFiltersFromSearch(
      'minRiskR=Infinity&maxRiskR=-1&minPlannedRr=nan',
    )
    expect(parsed.minRiskR).toBeUndefined()
    expect(parsed.maxRiskR).toBeUndefined()
    expect(parsed.minPlannedRr).toBeUndefined()
  })

  it('earliest detect date is maxRange-1 days before today IST', () => {
    const now = new Date('2026-08-17T10:00:00+05:30')
    expect(todayIstYmd(now)).toBe('2026-08-17')
    expect(researchEarliestDetectYmd(180, now)).toBe('2026-02-19')
  })
})

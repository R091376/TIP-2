import { describe, expect, it } from 'vitest'
import {
  parseResearchFiltersFromSearch,
  serializeResearchFilters,
  researchFilterChips,
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
})

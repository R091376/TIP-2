import { describe, expect, it } from 'vitest'
import {
  learnKindToPath,
  learnTopicPath,
  legacyAdminLearnToStandalone,
  parseLearnKind,
} from './routing'

describe('learn routing', () => {
  it('parseLearnKind accepts plural URL segments only', () => {
    expect(parseLearnKind('indicators')).toBe('indicator')
    expect(parseLearnKind('patterns')).toBe('pattern')
    expect(parseLearnKind('indicator')).toBeNull()
    expect(parseLearnKind('foo')).toBeNull()
  })

  it('learnKindToPath and learnTopicPath are stable', () => {
    expect(learnKindToPath('indicator')).toBe('indicators')
    expect(learnKindToPath('pattern')).toBe('patterns')
    expect(learnTopicPath('pattern', 'breakout')).toBe('/learn/patterns/breakout')
    expect(learnTopicPath('indicator', 'atr-14')).toBe('/learn/indicators/atr-14')
  })

  it('legacyAdminLearnToStandalone preserves topic paths', () => {
    expect(legacyAdminLearnToStandalone('/admin/learn')).toBe('/learn')
    expect(legacyAdminLearnToStandalone('/admin/learn/')).toBe('/learn')
    expect(legacyAdminLearnToStandalone('/admin/learn/patterns/breakout')).toBe(
      '/learn/patterns/breakout',
    )
    expect(legacyAdminLearnToStandalone('/admin/learn/indicators/atr-14')).toBe(
      '/learn/indicators/atr-14',
    )
    expect(legacyAdminLearnToStandalone('/admin/learn/patterns/breakout/')).toBe(
      '/learn/patterns/breakout',
    )
    expect(legacyAdminLearnToStandalone('/admin/learn/incomplete')).toBe('/learn')
  })
})

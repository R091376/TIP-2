import { describe, expect, it } from 'vitest'
import {
  computeInstanceMetrics,
  patternConfigBucket,
  patternConfigKnobs,
} from './patternInstanceMetrics'

describe('patternConfigBucket', () => {
  it('maps pattern types to config buckets', () => {
    expect(patternConfigBucket('breakout')).toBe('breakout')
    expect(patternConfigBucket('hammer')).toBe('pinbar')
    expect(patternConfigBucket('bullish_engulfing')).toBe('engulfing')
    expect(patternConfigBucket('higher_high')).toBe('structure')
    expect(patternConfigBucket('nope')).toBeNull()
  })
})

describe('patternConfigKnobs', () => {
  it('returns success ATR mult for breakout', () => {
    const knobs = patternConfigKnobs('breakout')
    const target = knobs.find((k) => k.key === 'success_atr_mult_without_retest')
    expect(target?.value).toBe('2')
    const retest = knobs.find((k) => k.key === 'retest_atr_mult')
    expect(retest?.value).toBe('0.25')
  })
})

describe('computeInstanceMetrics', () => {
  it('computes long risk/reward and MFE/MAE in R', () => {
    const m = computeInstanceMetrics({
      id: '1',
      symbolId: 'X',
      timeframe: '5m',
      patternType: 'breakout',
      direction: 'long',
      atrAtDetect: 2,
      entryPrice: 101,
      stopLevel: 100,
      targetLevel: 104,
      referenceLevel: 100,
      mfePrice: 103,
      maePrice: 100.2,
      endPrice: 104,
    })
    expect(m.riskR).toBeCloseTo(0.5, 6)
    expect(m.rewardR).toBeCloseTo(1.5, 6)
    expect(m.rewardRisk).toBeCloseTo(3, 6)
    expect(m.mfeR).toBeCloseTo(1, 6)
    expect(m.maeR).toBeCloseTo(0.4, 6)
    expect(m.moveR).toBeCloseTo(1.5, 6)
  })

  it('computes short MFE/MAE', () => {
    const m = computeInstanceMetrics({
      id: '2',
      symbolId: 'X',
      timeframe: '5m',
      patternType: 'breakdown',
      direction: 'short',
      atrAtDetect: 2,
      entryPrice: 100,
      stopLevel: 102,
      targetLevel: 96,
      mfePrice: 97,
      maePrice: 101,
    })
    expect(m.mfeR).toBeCloseTo(1.5, 6)
    expect(m.maeR).toBeCloseTo(0.5, 6)
    expect(m.riskR).toBeCloseTo(1, 6)
    expect(m.rewardR).toBeCloseTo(2, 6)
  })

  it('returns nulls when ATR missing', () => {
    const m = computeInstanceMetrics({
      id: '3',
      symbolId: 'X',
      timeframe: '5m',
      patternType: 'breakout',
      direction: 'long',
      atrAtDetect: 0,
      entryPrice: 100,
      stopLevel: 99,
    })
    expect(m.riskR).toBeNull()
    expect(m.mfeR).toBeNull()
  })
})

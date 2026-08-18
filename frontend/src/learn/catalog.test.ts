import { describe, expect, it } from 'vitest'
import { ALL_TOPICS, CONCEPT_TOPICS, getTopic, INDICATOR_TOPICS, PATTERN_TOPICS } from './catalog'
import { serializeTipDefault } from './serializeTipDefault'
import { lookupTipDefault, tipDefaults } from './tipDefaults'
import {
  EXPECTED_CONCEPT_SLUGS,
  EXPECTED_INDICATOR_SLUGS,
  EXPECTED_PATTERN_TYPE_IDS,
  TOPIC_DEFAULTS_BUCKET,
} from './topicBuckets'

function leafKeysForBucketPath(bucketPath: string): string[] {
  if (!bucketPath.includes('.')) {
    const v = lookupTipDefault(bucketPath)
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v as object).map((k) => `${bucketPath}.${k}`)
    }
    return [bucketPath]
  }
  // nested e.g. indicators.atr
  const v = lookupTipDefault(bucketPath)
  if (v != null && typeof v === 'object' && !Array.isArray(v)) {
    return Object.keys(v as object).map((k) => `${bucketPath}.${k}`)
  }
  return [bucketPath]
}

describe('learn catalog completeness', () => {
  it('has exactly the expected indicator slugs', () => {
    expect(INDICATOR_TOPICS.map((t) => t.slug).sort()).toEqual(
      [...EXPECTED_INDICATOR_SLUGS].sort(),
    )
  })

  it('has exactly the expected concept slugs', () => {
    expect(CONCEPT_TOPICS.map((t) => t.slug).sort()).toEqual(
      [...EXPECTED_CONCEPT_SLUGS].sort(),
    )
    expect(CONCEPT_TOPICS.every((t) => t.kind === 'concept')).toBe(true)
  })

  it('has exactly the expected pattern type ids', () => {
    const ids = PATTERN_TOPICS.map((t) => t.patternTypeId)
    expect(ids.every(Boolean)).toBe(true)
    expect([...ids].sort()).toEqual([...EXPECTED_PATTERN_TYPE_IDS].sort())
    expect(PATTERN_TOPICS.every((t) => t.slug === t.patternTypeId)).toBe(true)
  })

  it('registers every topic in TOPIC_DEFAULTS_BUCKET', () => {
    for (const t of ALL_TOPICS) {
      expect(TOPIC_DEFAULTS_BUCKET[t.slug], `bucket map for ${t.slug}`).toBeTruthy()
    }
  })

  it('getTopic resolves all catalog entries', () => {
    for (const t of ALL_TOPICS) {
      expect(getTopic(t.kind, t.slug)?.title).toBe(t.title)
    }
  })
})

describe('tipParameters cover tipDefaults buckets', () => {
  it('each topic covers 100% of mapped bucket keys via configKey + serialized value', () => {
    for (const topic of ALL_TOPICS) {
      const buckets = TOPIC_DEFAULTS_BUCKET[topic.slug]
      const requiredKeys = new Set<string>()
      for (const b of buckets) {
        for (const key of leafKeysForBucketPath(b)) {
          requiredKeys.add(key)
        }
      }

      const byKey = new Map(topic.tipParameters.map((p) => [p.configKey, p]))
      for (const key of requiredKeys) {
        const p = byKey.get(key)
        expect(p, `${topic.slug} missing tipParameter for ${key}`).toBeTruthy()
        const snap = lookupTipDefault(key)
        expect(p!.value).toBe(serializeTipDefault(snap))
      }
    }
  })
})

describe('tipDefaults shape', () => {
  it('has all eight detector buckets', () => {
    for (const k of [
      'breakout',
      'breakdown',
      'pinbar',
      'engulfing',
      'inside_bar',
      'structure',
      'consolidation',
      'volume_breakout',
    ]) {
      expect(tipDefaults[k as keyof typeof tipDefaults]).toBeTruthy()
    }
  })
})

describe('deep worked examples', () => {
  it('every topic has a workedExample with steps and result', () => {
    for (const t of ALL_TOPICS) {
      expect(t.workedExample?.steps?.length, `${t.slug} steps`).toBeGreaterThan(0)
      expect(t.workedExample?.result, `${t.slug} result`).toBeTruthy()
    }
  })

  it('every topic has ≥2 deep scenarios with unique ids', () => {
    for (const t of ALL_TOPICS) {
      const scenarios = t.workedExample.scenarios
      expect(scenarios, `${t.slug} scenarios`).toBeTruthy()
      expect(scenarios!.length, `${t.slug} scenario count`).toBeGreaterThanOrEqual(2)
      const ids = scenarios!.map((s) => s.id)
      expect(new Set(ids).size, `${t.slug} unique scenario ids`).toBe(ids.length)
      for (const s of scenarios!) {
        expect(s.title, `${t.slug}/${s.id} title`).toBeTruthy()
        expect(s.steps?.length, `${t.slug}/${s.id} steps`).toBeGreaterThan(0)
        expect(s.result, `${t.slug}/${s.id} result`).toBeTruthy()
        expect(s.setup?.length, `${t.slug}/${s.id} setup`).toBeGreaterThan(0)
      }
    }
  })

  it('every pattern has rulesVsMeasurements on at least one scenario', () => {
    for (const t of PATTERN_TOPICS) {
      const withRvm = t.workedExample.scenarios?.some((s) => s.rulesVsMeasurements)
      expect(withRvm, `${t.slug} rulesVsMeasurements`).toBe(true)
    }
  })

  it('every topic ships a code-drawn diagram on every scenario', () => {
    for (const t of ALL_TOPICS) {
      for (const sc of t.workedExample.scenarios || []) {
        expect(sc.diagram, `${t.slug}/${sc.id} diagram`).toBeTruthy()
        if (sc.diagram!.type === 'candles') {
          expect(sc.diagram!.candles.length, `${t.slug}/${sc.id} candles`).toBeGreaterThan(0)
        } else {
          expect(sc.diagram!.bars.length, `${t.slug}/${sc.id} bars`).toBeGreaterThan(0)
        }
      }
    }
  })
})

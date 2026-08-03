import { describe, expect, it } from 'vitest'
import { ALL_TOPICS, getTopic, INDICATOR_TOPICS, PATTERN_TOPICS } from './catalog'
import { serializeTipDefault } from './serializeTipDefault'
import { lookupTipDefault, tipDefaults } from './tipDefaults'
import {
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

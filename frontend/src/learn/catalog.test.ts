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

describe('external citations', () => {
  it('every Learn topic links at least one live https source', () => {
    for (const t of ALL_TOPICS) {
      expect(t.externalSources?.length, `${t.slug} externalSources`).toBeGreaterThan(0)
      for (const s of t.externalSources!) {
        expect(s.url.startsWith('https://'), `${t.slug} ${s.url}`).toBe(true)
        expect(s.label.length, `${t.slug} empty label`).toBeGreaterThan(0)
      }
    }
  })

  it('double / H&S topics link to live ChartSchool and Bulkowski pages', () => {
    for (const slug of ['double_bottom', 'double_top', 'head_shoulders', 'inverse_head_shoulders']) {
      const t = getTopic('pattern', slug)
      expect(t, slug).toBeTruthy()
      const urls = t!.externalSources!.map((s) => s.url)
      expect(urls.some((u) => u.includes('chartschool.stockcharts.com')), `${slug} ChartSchool`).toBe(
        true,
      )
      expect(urls.some((u) => u.includes('thepatternsite.com')), `${slug} Bulkowski`).toBe(true)
    }
  })

  it('indicators and Woodie cite ChartSchool or the open-weighted Woodie formula pages', () => {
    const atr = getTopic('indicator', 'atr-14')
    expect(atr!.externalSources!.some((s) => s.url.includes('average-true-range-atr'))).toBe(true)
    const don = getTopic('indicator', 'donchian-20')
    expect(don!.externalSources!.some((s) => s.url.includes('price-channels'))).toBe(true)
    const woodie = getTopic('concept', 'woodie-sr')
    expect(woodie!.externalSources!.some((s) => s.url.includes('mypivots.com'))).toBe(true)
    expect(woodie!.externalSources!.some((s) => s.url.includes('sierrachart.com'))).toBe(true)
  })
})

describe('tipDefaults shape', () => {
  it('has all ten detector buckets', () => {
    for (const k of [
      'breakout',
      'breakdown',
      'pinbar',
      'engulfing',
      'inside_bar',
      'structure',
      'consolidation',
      'volume_breakout',
      'double',
      'head_shoulders',
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

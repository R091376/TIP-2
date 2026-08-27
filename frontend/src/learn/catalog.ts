import type { LearnKind, LearnTopic } from './types'
import { atr14 } from './content/indicators/atr-14'
import { donchian20 } from './content/indicators/donchian-20'
import { volumeSma20 } from './content/indicators/volume-sma-20'
import { breakout } from './content/patterns/breakout'
import { breakdown } from './content/patterns/breakdown'
import { consolidation } from './content/patterns/consolidation'
import { volumeBreakout } from './content/patterns/volume_breakout'
import { hammer } from './content/patterns/hammer'
import { shootingStar } from './content/patterns/shooting_star'
import { bullishEngulfing } from './content/patterns/bullish_engulfing'
import { bearishEngulfing } from './content/patterns/bearish_engulfing'
import { insideBar } from './content/patterns/inside_bar'
import { higherHigh } from './content/patterns/higher_high'
import { lowerLow } from './content/patterns/lower_low'
import { doubleBottom } from './content/patterns/double_bottom'
import { doubleTop } from './content/patterns/double_top'
import { headShoulders } from './content/patterns/head_shoulders'
import { inverseHeadShoulders } from './content/patterns/inverse_head_shoulders'
import { woodieSr } from './content/concepts/woodie-sr'

export const INDICATOR_TOPICS: LearnTopic[] = [atr14, donchian20, volumeSma20]

export const CONCEPT_TOPICS: LearnTopic[] = [woodieSr]

export const PATTERN_TOPICS: LearnTopic[] = [
  breakout,
  breakdown,
  consolidation,
  volumeBreakout,
  hammer,
  shootingStar,
  bullishEngulfing,
  bearishEngulfing,
  insideBar,
  higherHigh,
  lowerLow,
  doubleBottom,
  doubleTop,
  headShoulders,
  inverseHeadShoulders,
]

export const ALL_TOPICS: LearnTopic[] = [
  ...INDICATOR_TOPICS,
  ...CONCEPT_TOPICS,
  ...PATTERN_TOPICS,
]

export function getTopic(kind: LearnKind, slug: string): LearnTopic | undefined {
  const list =
    kind === 'indicator'
      ? INDICATOR_TOPICS
      : kind === 'concept'
        ? CONCEPT_TOPICS
        : PATTERN_TOPICS
  return list.find((t) => t.slug === slug)
}

export function listTopics(kind?: LearnKind): LearnTopic[] {
  if (kind === 'indicator') return INDICATOR_TOPICS
  if (kind === 'concept') return CONCEPT_TOPICS
  if (kind === 'pattern') return PATTERN_TOPICS
  return ALL_TOPICS
}

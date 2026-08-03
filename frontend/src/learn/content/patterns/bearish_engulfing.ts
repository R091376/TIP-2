import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const bearishEngulfing: LearnTopic = {
  kind: 'pattern',
  slug: 'bearish_engulfing',
  title: 'Bearish engulfing',
  shortDescription: 'A red body that fully covers the prior green body — two-bar bearish reversal shape.',
  group: 'candlestick',
  direction: 'short',
  plottedOnChart: false,
  plainEnglish: [
    'Bearish engulfing mirrors the bullish case: a bullish prior bar, then a larger bearish body that covers it.',
    'TIP filters on ATR so the signal bar has meaningful size.',
    'Virtual short: confirm under the signal low; target about 1.5×ATR.',
  ],
  howWeCalculate: [
    'Prior bullish; signal bearish; signal body engulfs prior body.',
    'range_t ≥ min_range_atr_mult × ATR.',
    'Stop near two-bar high; confirm on later close below signal low.',
  ],
  formulaPlain:
    'Second bar is red and its body completely covers the first bar’s body; bar large enough vs ATR.',
  formulaFormal:
    'close_{t−1} > open_{t−1}; close_t < open_t\n' +
    'open_t ≥ close_{t−1} and close_t ≤ open_{t−1}\n' +
    'range_t ≥ 0.5×ATR',
  workedExample: {
    narrative: 'Green bar 100→104, then red opens 104.5 and closes 99.5.',
    inputs: [
      { label: 'Prior O/C', value: '100 / 104' },
      { label: 'Signal O/C', value: '104.5 / 99.5' },
    ],
    steps: [
      'Prior bullish, signal bearish',
      'Body engulfs prior body',
      'ATR size filter → Detected short',
    ],
    result: 'TIP would Detect bearish_engulfing when rules pass on closed bars.',
  },
  tipParameters: [
    tipParam('engulfing.min_range_atr_mult', 'Min signal range vs ATR'),
    tipParam('engulfing.success_atr_mult', 'Target distance in ATR'),
    tipParam('engulfing.max_candles_after_detect', 'Max bars after detect'),
    tipParam('engulfing.detector_version', 'Journal version tag', { advanced: true }),
    tipParam('atr_period', 'ATR length'),
  ],
  lifecycle: [
    'Detected: bearish body engulf + ATR filter',
    'Confirmed: later close < signal low',
    'Succeeded: entry − ~1.5×ATR',
    'Failed: close above two-bar high stop',
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'pattern', slug: 'bullish_engulfing', label: 'Bullish engulfing' },
    { kind: 'pattern', slug: 'shooting_star', label: 'Shooting star' },
  ],
  patternTypeId: 'bearish_engulfing',
  sourceDocs: ['docs/patterns/engulfing.md'],
  sourceCode: ['backend/app/patterns/engulfing.py'],
  lastReviewed: '2026-08-03',
  detectorVersionHint: 'engulfing-v1',
}

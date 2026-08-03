import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const shootingStar: LearnTopic = {
  kind: 'pattern',
  slug: 'shooting_star',
  title: 'Shooting star',
  shortDescription: 'Long upper wick, small body — potential bearish pin after a push higher.',
  group: 'candlestick',
  direction: 'short',
  plottedOnChart: false,
  plainEnglish: [
    'A shooting star is the upside-down pin: long upper shadow, small body near the lows of the range — sellers rejected higher prices.',
    'TIP shares the same pinbar geometry package as hammer, but flipped, and treats it as a short setup.',
    'Closed candles only; optional prior uptrend context when enabled.',
  ],
  howWeCalculate: [
    'Measure body, range, upper and lower wicks on the closed signal bar.',
    'Require upper wick ≥ 2×body, lower wick ≤ 0.25×range, body ≤ 0.35×range, range ≥ 0.5×ATR.',
    'Optional trend context: simple prior up-bias.',
    'Short lifecycle: confirm lower, target 1.5×ATR, or fail.',
  ],
  formulaPlain:
    'Long upper shadow at least twice the body; small body; tiny lower wick; meaningful range vs ATR.',
  formulaFormal:
    'upper ≥ 2×body; lower ≤ 0.25×range; body ≤ 0.35×range\n' +
    'range ≥ 0.5×ATR',
  workedExample: {
    narrative: 'Bar spikes to 110 then closes 101; ATR is 3.',
    inputs: [
      { label: 'O/H/L/C', value: '102 / 110 / 100.8 / 101' },
      { label: 'ATR', value: '3' },
    ],
    steps: [
      'body = 1; range = 9.2; upper ≈ 8; lower small',
      'upper ≥ 2×body and range ≥ 0.5×ATR → geometry OK',
      'Detected short shooting_star if context passes',
    ],
    result: 'TIP would Detect a shooting star when rules pass on the closed bar.',
  },
  tipParameters: [
    tipParam('pinbar.shadow_body_mult', 'Dominant wick must be ≥ this × body'),
    tipParam('pinbar.max_body_range_ratio', 'Max body as fraction of full range'),
    tipParam('pinbar.max_opposite_wick_range_ratio', 'Max opposite wick as fraction of range'),
    tipParam('pinbar.min_range_atr_mult', 'Min full range vs ATR'),
    tipParam('pinbar.success_atr_mult', 'Target distance in ATR'),
    tipParam('pinbar.require_trend_context', 'Require simple prior trend bias'),
    tipParam('pinbar.trend_lookback', 'Bars used for trend context'),
    tipParam('pinbar.max_candles_after_detect', 'Max bars after detect'),
    tipParam('pinbar.detector_version', 'Journal version tag', { advanced: true }),
    tipParam('atr_period', 'ATR length'),
  ],
  lifecycle: [
    'Detected: shooting-star geometry on closed bar',
    'Confirmed: later close below signal low',
    'Succeeded: ~1.5×ATR downside',
    'Failed: close through stop above the pin',
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'pattern', slug: 'hammer', label: 'Hammer' },
    { kind: 'pattern', slug: 'bearish_engulfing', label: 'Bearish engulfing' },
    { kind: 'indicator', slug: 'atr-14', label: 'ATR (14)' },
  ],
  patternTypeId: 'shooting_star',
  sourceDocs: ['docs/patterns/hammer-shooting-star.md'],
  sourceCode: ['backend/app/patterns/pinbar.py'],
  lastReviewed: '2026-08-03',
  detectorVersionHint: 'pinbar-v1',
}

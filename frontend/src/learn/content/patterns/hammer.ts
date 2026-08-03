import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const hammer: LearnTopic = {
  kind: 'pattern',
  slug: 'hammer',
  title: 'Hammer',
  shortDescription: 'Long lower wick, small body — potential bullish pin after pressure lower.',
  group: 'candlestick',
  direction: 'long',
  plottedOnChart: false,
  plainEnglish: [
    'A hammer is a pin-bar shape: a small real body near the top of the range and a long lower shadow, suggesting buyers pushed back after selling.',
    'TIP only uses closed bars and applies size filters vs ATR so tiny noise bars do not count.',
    'By default it also wants simple downtrend context so the shape is more reversal-like.',
  ],
  howWeCalculate: [
    'On the signal bar: body = |close−open|, range = high−low, lower wick, upper wick.',
    'Require range ≥ 0.5×ATR, body ≤ 0.35×range, lower wick ≥ 2×body, upper wick ≤ 0.25×range.',
    'If require_trend_context is on, check a simple prior down-bias over trend_lookback.',
    'Detected → short lifecycle to confirm higher, hit 1.5×ATR target, or fail.',
  ],
  formulaPlain:
    'Long lower shadow at least twice the body; small body; tiny upper wick; bar not microscopic vs ATR.',
  formulaFormal:
    'body = |close − open|; range = high − low\n' +
    'lower ≥ 2×body; upper ≤ 0.25×range; body ≤ 0.35×range\n' +
    'range ≥ 0.5×ATR',
  workedExample: {
    narrative: 'Bar opens 100, trades to 94, closes 99.5; ATR is 4.',
    inputs: [
      { label: 'O/H/L/C', value: '100 / 100.2 / 94 / 99.5' },
      { label: 'ATR', value: '4' },
    ],
    steps: [
      'body = 0.5; range = 6.2; lower ≈ 5.5; upper ≈ 0.2',
      'range 6.2 ≥ 0.5×4 = 2 → size OK',
      'lower 5.5 ≥ 2×0.5 → shadow OK; body/range and upper wick OK',
      'If trend context passes → Detected long hammer',
    ],
    result: 'TIP would Detect a hammer when geometry and context pass on a closed bar.',
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
    'Detected: hammer geometry on closed bar (+ optional trend context)',
    'Confirmed: later close beyond signal high',
    'Succeeded: ~1.5×ATR from entry',
    'Failed: close through stop under the pin',
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'pattern', slug: 'shooting_star', label: 'Shooting star' },
    { kind: 'pattern', slug: 'bullish_engulfing', label: 'Bullish engulfing' },
    { kind: 'indicator', slug: 'atr-14', label: 'ATR (14)' },
  ],
  patternTypeId: 'hammer',
  sourceDocs: ['docs/patterns/hammer-shooting-star.md'],
  sourceCode: ['backend/app/patterns/pinbar.py'],
  lastReviewed: '2026-08-03',
  detectorVersionHint: 'pinbar-v1',
}

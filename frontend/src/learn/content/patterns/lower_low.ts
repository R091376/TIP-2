import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const lowerLow: LearnTopic = {
  kind: 'pattern',
  slug: 'lower_low',
  title: 'Lower low',
  shortDescription: 'A confirmed swing low that is lower than the previous swing low.',
  group: 'structure',
  direction: 'short',
  plottedOnChart: false,
  plainEnglish: [
    'Lower low is the bearish structure twin of higher high: a new swing trough under the previous one.',
    'Swings use the same fractal width and non-repainting confirmation (right-side bars must close).',
    'TIP journals a short-biased virtual trade from that structure.',
  ],
  howWeCalculate: [
    'Pivot low at i when low_i is strictly below neighbors in [i−N, i+N], confirmed at i+N.',
    'If new pivot low < previous pivot low → lower_low Detected.',
    'Stop near prior swing high; target ~1.5×ATR.',
  ],
  formulaPlain:
    'A bar is a swing low when its low is lower than the lows of neighbors on both sides. A lower low is a new swing low under the previous one.',
  formulaFormal:
    'pivot low at i if low_i < low_j for j in [i−N, i+N] except i\n' +
    'lower_low if low_i < previous pivot low',
  workedExample: {
    narrative: 'Prior pivot low 50; new confirmed pivot low 47.',
    inputs: [
      { label: 'Prior pivot low', value: '50' },
      { label: 'New pivot low', value: '47' },
    ],
    steps: [
      'Confirm pivot with fractal_width bars on the right closed',
      '47 < 50 → lower_low Detected',
    ],
    result: 'TIP would Detect lower_low on the confirmed lower pivot.',
  },
  tipParameters: [
    tipParam('structure.fractal_width', 'Neighbor bars each side for swing pivots'),
    tipParam('structure.success_atr_mult', 'Target distance in ATR'),
    tipParam('structure.max_candles_after_detect', 'Max bars after detect (structure uses 30)'),
    tipParam('structure.detector_version', 'Journal version tag', { advanced: true }),
    tipParam('atr_period', 'ATR length'),
  ],
  lifecycle: [
    'Detected: confirmed pivot low < prior pivot low',
    'Confirmed: later close below the new structure low',
    'Succeeded: ~1.5×ATR downside',
    'Failed: close through structure stop (prior swing high area)',
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'pattern', slug: 'higher_high', label: 'Higher high' },
    { kind: 'indicator', slug: 'atr-14', label: 'ATR (14)' },
  ],
  patternTypeId: 'lower_low',
  sourceDocs: ['docs/patterns/hh-ll.md'],
  sourceCode: ['backend/app/patterns/structure.py'],
  lastReviewed: '2026-08-03',
  detectorVersionHint: 'structure-v1',
}

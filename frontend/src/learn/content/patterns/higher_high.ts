import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const higherHigh: LearnTopic = {
  kind: 'pattern',
  slug: 'higher_high',
  title: 'Higher high',
  shortDescription: 'A confirmed swing high that is higher than the previous swing high.',
  group: 'structure',
  direction: 'long',
  plottedOnChart: false,
  plainEnglish: [
    'Higher high is a market-structure idea: a new swing peak is higher than the last swing peak.',
    'TIP finds swing highs with a fractal width (default 2): a bar’s high is strictly above neighbors on both sides, only after the right-side bars have closed (no repaint).',
    'Then it tracks a long-biased virtual trade from that structure break.',
  ],
  howWeCalculate: [
    'With fractal_width N=2, a pivot high at i is confirmed when bar i+N has closed.',
    'If that pivot high is greater than the previous pivot high → higher_high Detected.',
    'Entry on the confirm bar close; stop near prior swing low; confirm and target use ATR multiples.',
  ],
  formulaPlain:
    'A bar is a swing high when its high is higher than the highs of the two bars on each side. A higher high is a new swing high above the previous one.',
  formulaFormal:
    'pivot high at i if high_i > high_j for all j in [i−N, i+N] except i (N=2)\n' +
    'higher_high if high_i > previous pivot high',
  workedExample: {
    narrative: 'Earlier pivot high 100; later confirmed pivot high 105 with N=2.',
    inputs: [
      { label: 'Prior pivot high', value: '100' },
      { label: 'New pivot high', value: '105' },
      { label: 'fractal_width', value: '2' },
    ],
    steps: [
      'Wait until right-side bars close so pivot does not repaint',
      '105 > 100 → higher_high Detected',
    ],
    result: 'TIP would Detect higher_high once the new pivot is confirmed and higher.',
  },
  tipParameters: [
    tipParam('structure.fractal_width', 'Neighbor bars each side for swing pivots'),
    tipParam('structure.success_atr_mult', 'Target distance in ATR'),
    tipParam('structure.max_candles_after_detect', 'Max bars after detect (structure uses 30)'),
    tipParam('structure.detector_version', 'Journal version tag', { advanced: true }),
    tipParam('atr_period', 'ATR length'),
  ],
  lifecycle: [
    'Detected: confirmed pivot high > prior pivot high',
    'Confirmed: later close above the new structure high',
    'Succeeded: ~1.5×ATR',
    'Failed: close through structure stop (prior swing low area)',
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'pattern', slug: 'lower_low', label: 'Lower low' },
    { kind: 'indicator', slug: 'atr-14', label: 'ATR (14)' },
  ],
  patternTypeId: 'higher_high',
  sourceDocs: ['docs/patterns/hh-ll.md'],
  sourceCode: ['backend/app/patterns/structure.py'],
  lastReviewed: '2026-08-03',
  detectorVersionHint: 'structure-v1',
}

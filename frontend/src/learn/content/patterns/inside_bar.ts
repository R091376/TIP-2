import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const insideBar: LearnTopic = {
  kind: 'pattern',
  slug: 'inside_bar',
  title: 'Inside bar',
  shortDescription: 'A bar fully inside the mother bar, then a close that breaks the mother range.',
  group: 'range',
  direction: 'both',
  plottedOnChart: false,
  plainEnglish: [
    'An inside bar is a pause: the middle bar’s high and low sit entirely inside the previous “mother” bar.',
    'TIP waits for a third bar that closes outside the mother’s range — that break sets long or short.',
    'Mother bar must be large enough vs ATR so the pattern is not pure noise.',
  ],
  howWeCalculate: [
    'Identify mother (t−2), inside (t−1), break (t).',
    'Inside: high lower than mother high and low higher than mother low.',
    'Long break: close_t > mother high; short break: close_t < mother low.',
    'Mother range ≥ 0.5×ATR; then short lifecycle with mother extreme as stop.',
  ],
  formulaPlain:
    'Middle bar inside mother; signal bar closes outside mother high (long) or low (short).',
  formulaFormal:
    'high_{t−1} < high_{t−2} and low_{t−1} > low_{t−2}\n' +
    'long: close_t > high_{t−2}; short: close_t < low_{t−2}\n' +
    'range_mother ≥ 0.5×ATR',
  workedExample: {
    narrative: 'Mother 100–110; inside 102–108; break closes 111.',
    inputs: [
      { label: 'Mother H/L', value: '110 / 100' },
      { label: 'Inside H/L', value: '108 / 102' },
      { label: 'Break close', value: '111' },
    ],
    steps: [
      'Inside fully within mother',
      'close 111 > 110 → long inside_bar Detected',
      'Stop references mother low 100',
    ],
    result: 'TIP would Detect a long inside_bar break on the closed third bar.',
  },
  tipParameters: [
    tipParam('inside_bar.min_mother_range_atr_mult', 'Min mother range vs ATR'),
    tipParam('inside_bar.success_atr_mult', 'Target distance in ATR'),
    tipParam('inside_bar.max_candles_after_detect', 'Max bars after detect'),
    tipParam('inside_bar.max_bars_after_inside', 'Related timing window after inside bar', {
      advanced: true,
    }),
    tipParam('inside_bar.detector_version', 'Journal version tag', { advanced: true }),
    tipParam('atr_period', 'ATR length'),
  ],
  lifecycle: [
    'Detected: mother + inside + break close outside mother',
    'Confirmed: later close still beyond mother extreme',
    'Succeeded: ~1.5×ATR from entry',
    'Failed: close back through mother stop side',
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'pattern', slug: 'consolidation', label: 'Consolidation' },
    { kind: 'pattern', slug: 'breakout', label: 'Breakout' },
  ],
  patternTypeId: 'inside_bar',
  sourceDocs: ['docs/patterns/inside-bar.md'],
  sourceCode: ['backend/app/patterns/inside_bar.py'],
  lastReviewed: '2026-08-03',
  detectorVersionHint: 'inside-bar-v1',
}

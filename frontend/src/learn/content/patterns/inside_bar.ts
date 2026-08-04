import { LONG_TRADE_RULES_VS_MEASUREMENTS } from '../../exampleBlocks'
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
    narrative: 'Mother 100–110; inside 102–108; break closes 111 → long inside_bar.',
    inputs: [
      { label: 'Mother H/L', value: '110 / 100' },
      { label: 'Inside H/L', value: '108 / 102' },
      { label: 'Break close', value: '111' },
      { label: 'ATR', value: '4' },
    ],
    steps: [
      'Inside fully within mother',
      'close 111 > 110 → long Detected',
      'Stop references mother low 100; target entry+1.5×ATR',
    ],
    result: 'Long inside_bar on the closed third bar.',
    scenarios: [
      {
        id: 'success-long',
        title: 'Mother + inside + upside break → success',
        narrative:
          'Three closed bars. Detect happens on the break bar, not on the inside bar alone. Then a normal long virtual trade runs.',
        setup: [
          { label: 'Mother H/L', value: '110 / 100' },
          { label: 'Mother range vs ATR', value: '10 ≥ 0.5×ATR (ATR=4 → need ≥2)' },
          { label: 'Inside H/L', value: '108 / 102' },
          { label: 'Break O/H/L/C', value: '108 / 112 / 107 / 111' },
          { label: 'Entry / stop / target', value: '111 / 100 / 111+6 = 117' },
        ],
        diagram: {
          type: 'candles',
          title: 'Mother → inside → upside break → target',
          caption:
            'Inside bar fully within mother 100–110. Break close 111 detects long. Stop at mother low 100, target 117.',
          candles: [
            { o: 102, h: 110, l: 100, c: 108, label: 'Mother' },
            { o: 104, h: 108, l: 102, c: 105, label: 'Inside' },
            { o: 108, h: 112, l: 107, c: 111, label: 'Break', emphasis: true },
            { o: 112, h: 118, l: 112, c: 116, label: 'Win' },
          ],
          levels: [
            { price: 117, label: 'Target', kind: 'target' },
            { price: 111, label: 'Entry', kind: 'entry' },
            { price: 110, label: 'Mother H', kind: 'reference' },
            { price: 100, label: 'Stop', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: 'Mother',
            ohlc: 'H 110 / L 100',
            note: 'Wide bar — the container.',
          },
          {
            label: 'Inside',
            ohlc: 'H 108 / L 102',
            note: 'Fully inside mother. Not a detect yet.',
          },
          {
            label: 'Bar 0 (break / detect)',
            ohlc: 'H 112 / L 107 / C 111',
            note: 'close 111 > mother high 110 → Detected long. Freeze rails.',
          },
          {
            label: 'Bar 1 (target)',
            ohlc: 'H 118 / L 112 / C 116',
            note: 'High ≥ 117 → Succeeded.',
          },
        ],
        scoreboards: [
          {
            label: 'Final',
            rows: [
              { metric: 'Outcome', value: 'Succeeded' },
              { metric: 'MFE (R)', value: '(118−111)/4 = 1.75 R' },
              { metric: 'MAE (R)', value: '(111−107)/4 = 1.0 R' },
            ],
          },
        ],
        steps: [
          'Detect only on the break close outside the mother.',
          'Stop for a long uses the mother low side.',
          'Short break would be close under mother low (mirror story).',
        ],
        rulesVsMeasurements: { ...LONG_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Succeeded long inside_bar; path metrics journaled.',
      },
      {
        id: 'fail',
        title: 'Fail — break then back through mother stop',
        narrative: 'After a long detect, price closes back through the mother low → Failed.',
        setup: [{ label: 'Entry / stop', value: '111 / 100' }],
        diagram: {
          type: 'candles',
          title: 'Inside-bar false break — fail under mother low',
          caption:
            'After the upside break detect, price closes back through mother low 100 → Failed.',
          candles: [
            { o: 102, h: 110, l: 100, c: 108, label: 'Mother' },
            { o: 104, h: 108, l: 102, c: 105, label: 'Inside' },
            { o: 108, h: 112, l: 107, c: 111, label: 'Break', emphasis: true },
            { o: 110, h: 110, l: 98, c: 99, label: 'Fail' },
          ],
          levels: [
            { price: 117, label: 'Target', kind: 'target' },
            { price: 111, label: 'Entry', kind: 'entry' },
            { price: 100, label: 'Stop', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: 'Bar 0',
            ohlc: 'C 111',
            note: 'Detected long break.',
          },
          {
            label: 'Bar 1 (fail)',
            ohlc: 'H 110 / L 98 / C 99',
            note: 'close under mother low stop → Failed.',
          },
        ],
        steps: [
          'False breakouts are exactly why both success and fail paths matter in stats.',
          'MFE may be small if price never ran after the break.',
        ],
        rulesVsMeasurements: { ...LONG_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Failed inside_bar after a false upside break.',
      },
    ],
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
  lastReviewed: '2026-08-04',
  detectorVersionHint: 'inside-bar-v1',
}

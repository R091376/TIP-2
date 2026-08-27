import { LONG_TRADE_RULES_VS_MEASUREMENTS } from '../../exampleBlocks'
import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'
import { HIGHER_HIGH_SOURCES } from '../learnSources'

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
    narrative: 'Prior pivot high 100; new confirmed pivot high 105 with N=2 → Detected long structure.',
    inputs: [
      { label: 'Prior pivot high', value: '100' },
      { label: 'New pivot high', value: '105' },
      { label: 'fractal_width', value: '2' },
      { label: 'ATR', value: '2' },
    ],
    steps: [
      'Wait for right-side bars to close (non-repaint)',
      '105 > 100 → higher_high Detected',
      'Target ~ entry + 1.5×ATR; stop near prior swing low',
    ],
    result: 'Detected once the new pivot is confirmed and higher.',
    scenarios: [
      {
        id: 'success',
        title: 'Confirmed higher pivot → target success',
        narrative:
          'Structure patterns are slower than single-candle pins: the pivot is only real after neighbor bars on the right have closed. Then a virtual long runs.',
        setup: [
          { label: 'Prior swing high', value: '100' },
          { label: 'New swing high (pivot)', value: '105' },
          { label: 'fractal_width N', value: '2' },
          { label: 'ATR', value: '2' },
          { label: 'Entry (confirm bar close)', value: '104 (example)' },
          { label: 'Target (~1.5×ATR)', value: '104 + 3 = 107' },
          { label: 'Stop region', value: 'near prior swing low (example 98)' },
        ],
        diagram: {
          type: 'candles',
          title: 'Higher high structure — pivot then run',
          caption:
            'Prior swing ~100, new pivot high 105 (confirmed after right neighbors). Entry 104, stop ~98, target 107.',
          candles: [
            { o: 98, h: 100, l: 97, c: 99, label: 'Prior HH' },
            { o: 99, h: 102, l: 98.5, c: 101, label: '…' },
            { o: 101, h: 105, l: 100.5, c: 103, label: 'Pivot', emphasis: true },
            { o: 103, h: 104, l: 102, c: 103.5, label: 'Right' },
            { o: 103.5, h: 104.5, l: 102.5, c: 104, label: 'Confirm' },
            { o: 104, h: 108, l: 103.5, c: 107, label: 'Win' },
          ],
          levels: [
            { price: 107, label: 'Target', kind: 'target' },
            { price: 105, label: 'New HH', kind: 'reference' },
            { price: 104, label: 'Entry', kind: 'entry' },
            { price: 100, label: 'Prior HH', kind: 'other' },
            { price: 98, label: 'Stop', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: 'Pivot bar',
            ohlc: 'H 105',
            note: 'Candidate swing high — not confirmed until N bars to the right close.',
          },
          {
            label: 'Confirm (+N bars)',
            ohlc: 'neighbors closed; C 104',
            note: 'Pivot locked at 105 > prior 100 → Detected higher_high. Freeze rails.',
          },
          {
            label: 'Later (target)',
            ohlc: 'H 108 / C 107',
            note: 'High ≥ 107 → Succeeded.',
          },
        ],
        scoreboards: [
          {
            label: 'Final',
            rows: [
              { metric: 'Outcome', value: 'Succeeded' },
              { metric: 'MFE (R)', value: '(108−104)/2 = 2.0 R' },
              { metric: 'Structure note', value: 'Non-repainting pivot confirmation' },
            ],
          },
        ],
        steps: [
          'Never treat an unconfirmed mid-pivot as final — right bars must close.',
          'Higher high compares successive confirmed pivots, not every bar high.',
          'After detect, stop/target/MFE/MAE follow the usual virtual long idea.',
        ],
        rulesVsMeasurements: { ...LONG_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Succeeded higher_high structure trade with path metrics.',
      },
      {
        id: 'fail',
        title: 'Fail through structure stop',
        narrative: 'After detect, price closes through the prior swing-low stop region → Failed.',
        setup: [{ label: 'Entry / stop', value: '104 / ~98' }],
        diagram: {
          type: 'candles',
          title: 'Higher high fail through structure stop',
          caption: 'After detect, close through prior swing-low stop ~98 → Failed.',
          candles: [
            { o: 101, h: 105, l: 100.5, c: 103, label: 'Pivot' },
            { o: 103.5, h: 104.5, l: 102.5, c: 104, label: 'Detect', emphasis: true },
            { o: 103, h: 103.5, l: 97, c: 97.5, label: 'Fail' },
          ],
          levels: [
            { price: 107, label: 'Target', kind: 'target' },
            { price: 104, label: 'Entry', kind: 'entry' },
            { price: 98, label: 'Stop', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: 'Detect',
            note: 'higher_high confirmed.',
          },
          {
            label: 'Fail bar',
            ohlc: 'L 97 / C 97.5',
            note: 'close through stop → Failed. MAE captures the adverse run.',
          },
        ],
        steps: [
          'Structure can fail like any virtual trade — journal still stores MFE/MAE.',
        ],
        rulesVsMeasurements: { ...LONG_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Failed higher_high with both path metrics kept.',
      },
    ],
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
  externalSources: HIGHER_HIGH_SOURCES,
  lastReviewed: '2026-08-04',
  detectorVersionHint: 'structure-v1',
}

import { SHORT_TRADE_RULES_VS_MEASUREMENTS } from '../../exampleBlocks'
import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'
import { LOWER_LOW_SOURCES } from '../learnSources'

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
    narrative: 'Prior pivot low 50; new confirmed pivot low 47 → Detected short structure.',
    inputs: [
      { label: 'Prior pivot low', value: '50' },
      { label: 'New pivot low', value: '47' },
      { label: 'ATR', value: '2' },
    ],
    steps: [
      'Confirm pivot with right-side bars closed',
      '47 < 50 → lower_low Detected',
      'Target ~ entry − 1.5×ATR; stop near prior swing high',
    ],
    result: 'Detected on the confirmed lower pivot.',
    scenarios: [
      {
        id: 'success',
        title: 'Confirmed lower pivot → downside target',
        narrative:
          'Same non-repainting pivot rules as higher high, flipped for lows. Virtual short after confirmation.',
        setup: [
          { label: 'Prior swing low', value: '50' },
          { label: 'New swing low', value: '47' },
          { label: 'fractal_width N', value: '2' },
          { label: 'ATR', value: '2' },
          { label: 'Entry (confirm close)', value: '48 (example)' },
          { label: 'Target (~1.5×ATR)', value: '48 − 3 = 45' },
          { label: 'Stop region', value: 'near prior swing high (example 52)' },
        ],
        diagram: {
          type: 'candles',
          title: 'Lower low structure — pivot then drop',
          caption:
            'Prior swing low 50, new pivot low 47. Entry 48, stop ~52, target 45. Later low clears target.',
          candles: [
            { o: 51, h: 52, l: 50, c: 50.5, label: 'Prior LL' },
            { o: 50.5, h: 51, l: 49, c: 49.5, label: '…' },
            { o: 49, h: 49.5, l: 47, c: 48, label: 'Pivot', emphasis: true },
            { o: 48, h: 49, l: 47.5, c: 48.2, label: 'Right' },
            { o: 48.2, h: 48.5, l: 47.8, c: 48, label: 'Confirm' },
            { o: 48, h: 48.2, l: 44.5, c: 45.2, label: 'Win' },
          ],
          levels: [
            { price: 52, label: 'Stop', kind: 'stop' },
            { price: 50, label: 'Prior LL', kind: 'other' },
            { price: 48, label: 'Entry', kind: 'entry' },
            { price: 47, label: 'New LL', kind: 'reference' },
            { price: 45, label: 'Target', kind: 'target' },
          ],
        },
        timeline: [
          {
            label: 'Pivot low bar',
            ohlc: 'L 47',
            note: 'Candidate — wait for right neighbors to close.',
          },
          {
            label: 'Confirm (+N)',
            ohlc: 'C 48',
            note: '47 < 50 → Detected lower_low. Freeze short rails.',
          },
          {
            label: 'Later (target)',
            ohlc: 'L 44.5 / C 45.2',
            note: 'Low ≤ 45 → Succeeded.',
          },
        ],
        scoreboards: [
          {
            label: 'Final',
            rows: [
              { metric: 'Outcome', value: 'Succeeded' },
              { metric: 'MFE (R) short', value: '(48−44.5)/2 = 1.75 R' },
            ],
          },
        ],
        steps: [
          'Pivots confirm only after the right-side window closes.',
          'Compare successive confirmed troughs, not every bar low.',
        ],
        rulesVsMeasurements: { ...SHORT_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Succeeded lower_low with path metrics.',
      },
      {
        id: 'fail',
        title: 'Fail through prior swing-high stop',
        narrative: 'After detect, price closes back above the structure stop → Failed short.',
        setup: [{ label: 'Entry / stop', value: '48 / ~52' }],
        diagram: {
          type: 'candles',
          title: 'Lower low fail through structure stop',
          caption: 'After detect, close above prior swing-high stop ~52 → Failed short.',
          candles: [
            { o: 49, h: 49.5, l: 47, c: 48, label: 'Pivot' },
            { o: 48.2, h: 48.5, l: 47.8, c: 48, label: 'Detect', emphasis: true },
            { o: 48.5, h: 53, l: 48, c: 52.5, label: 'Fail' },
          ],
          levels: [
            { price: 52, label: 'Stop', kind: 'stop' },
            { price: 48, label: 'Entry', kind: 'entry' },
            { price: 45, label: 'Target', kind: 'target' },
          ],
        },
        timeline: [
          {
            label: 'Detect',
            note: 'lower_low confirmed.',
          },
          {
            label: 'Fail bar',
            ohlc: 'H 53 / C 52.5',
            note: 'close through stop → Failed. MAE captures the squeeze higher.',
          },
        ],
        steps: ['Structure fails are first-class journal outcomes, same as candle patterns.'],
        rulesVsMeasurements: { ...SHORT_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Failed lower_low with MFE/MAE kept.',
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
  externalSources: LOWER_LOW_SOURCES,
  lastReviewed: '2026-08-04',
  detectorVersionHint: 'structure-v1',
}

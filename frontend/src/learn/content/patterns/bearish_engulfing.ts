import { SHORT_TRADE_RULES_VS_MEASUREMENTS } from '../../exampleBlocks'
import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'
import { BEARISH_ENGULFING_SOURCES } from '../learnSources'

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
    narrative: 'Green 100→104, red opens 104.5 closes 99.5; ATR 2 → detect short.',
    inputs: [
      { label: 'Prior O/C', value: '100 / 104' },
      { label: 'Signal O/C', value: '104.5 / 99.5' },
      { label: 'ATR', value: '2' },
    ],
    steps: [
      'Engulf + size OK → Detected short',
      'Target ≈ 99.5 − 3 = 96.5; stop near two-bar high',
    ],
    result: 'Short bearish_engulfing lifecycle.',
    scenarios: [
      {
        id: 'success',
        title: 'Detect → downside target success',
        narrative:
          'Two closed bars form the shape. Virtual short freezes entry at signal close; favorable path is lower.',
        setup: [
          { label: 'Prior (bullish) O/C', value: '100 / 104' },
          { label: 'Signal O/H/L/C', value: '104.5 / 105 / 99 / 99.5' },
          { label: 'ATR', value: '2' },
          { label: 'Entry / target', value: '99.5 / 96.5' },
          { label: 'Stop region', value: 'near two-bar high (~105)' },
        ],
        diagram: {
          type: 'candles',
          title: 'Bearish engulfing → short to target',
          caption:
            'Green prior, red engulf. Entry 99.5, stop ~105, target 96.5. Next bar low clears the target.',
          candles: [
            { o: 100, h: 104.5, l: 99.5, c: 104, label: 'Prior' },
            { o: 104.5, h: 105, l: 99, c: 99.5, label: 'Detect', emphasis: true },
            { o: 99, h: 99, l: 96, c: 96.8, label: 'Win' },
          ],
          levels: [
            { price: 105, label: 'Stop', kind: 'stop' },
            { price: 99.5, label: 'Entry', kind: 'entry' },
            { price: 96.5, label: 'Target', kind: 'target' },
          ],
        },
        timeline: [
          {
            label: 'Prior bar',
            ohlc: 'O 100 / C 104',
            note: 'Bullish first bar.',
          },
          {
            label: 'Bar 0 (detect)',
            ohlc: 'O 104.5 / H 105 / L 99 / C 99.5',
            note: 'Bearish body engulfs → Detected short.',
          },
          {
            label: 'Bar 1 (target)',
            ohlc: 'H 99 / L 96 / C 96.8',
            note: 'Low ≤ 96.5 → Succeeded.',
          },
        ],
        scoreboards: [
          {
            label: 'Final',
            rows: [
              { metric: 'Outcome', value: 'Succeeded' },
              { metric: 'MFE (R)', value: '(99.5−96)/2 = 1.75 R' },
              { metric: 'MAE (R)', value: '(105−99.5)/2 = 2.75 R' },
            ],
          },
        ],
        steps: [
          'Mirror of bullish engulfing.',
          'Stop sits near the two-bar high; target is ATR-based below entry.',
        ],
        rulesVsMeasurements: { ...SHORT_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Succeeded short engulfing with MFE/MAE filled.',
      },
      {
        id: 'fail',
        title: 'Fail — reclaim above two-bar high',
        narrative: 'Price closes back above the stop region → Failed short.',
        setup: [{ label: 'Entry / stop', value: '99.5 / ~105' }],
        diagram: {
          type: 'candles',
          title: 'Bearish engulfing fail above stop',
          caption: 'Close back above the two-bar high stop ~105 → Failed short.',
          candles: [
            { o: 100, h: 104.5, l: 99.5, c: 104, label: 'Prior' },
            { o: 104.5, h: 105, l: 99, c: 99.5, label: 'Detect', emphasis: true },
            { o: 100, h: 107, l: 101, c: 106, label: 'Fail' },
          ],
          levels: [
            { price: 105, label: 'Stop', kind: 'stop' },
            { price: 99.5, label: 'Entry', kind: 'entry' },
            { price: 96.5, label: 'Target', kind: 'target' },
          ],
        },
        timeline: [
          {
            label: 'Bar 0',
            ohlc: 'H 105 / L 99 / C 99.5',
            note: 'Detected short.',
          },
          {
            label: 'Bar 1 (fail)',
            ohlc: 'H 107 / L 101 / C 106',
            note: 'close above stop → Failed.',
          },
        ],
        steps: ['Failed shorts still keep any favorable dip as MFE.'],
        rulesVsMeasurements: { ...SHORT_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Failed bearish_engulfing with both path metrics.',
      },
    ],
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
  externalSources: BEARISH_ENGULFING_SOURCES,
  lastReviewed: '2026-08-04',
  detectorVersionHint: 'engulfing-v1',
}

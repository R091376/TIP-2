import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const atr14: LearnTopic = {
  kind: 'indicator',
  slug: 'atr-14',
  title: 'ATR (14)',
  shortDescription: 'How big is a normal candle move? TIP’s volatility yardstick.',
  group: 'indicator',
  plottedOnChart: false,
  plainEnglish: [
    'ATR means Average True Range. It answers: “How large is a typical move for this symbol on this timeframe?”',
    'TIP does not plot ATR on the chart. Pattern detectors use it behind the scenes for retest bands, targets, and a unit of risk (R-unit).',
    'True range also counts gaps: a bar that opens far from yesterday’s close still counts as a big move.',
  ],
  howWeCalculate: [
    'For each closed bar, compute true range (TR): the largest of (high−low), |high−prior close|, |low−prior close|.',
    'After enough bars, take the simple average of the first 14 true ranges — that is the first ATR.',
    'For each new bar, smooth with Wilder’s method: blend the previous ATR with the new TR.',
    'If fewer than 15 closed bars (14 TR values need a prior close), ATR is unavailable and patterns that need it will not open.',
  ],
  formulaPlain:
    'First ATR is the average of 14 true ranges. Later ATR values = (previous ATR × 13 + new true range) ÷ 14.',
  formulaFormal:
    'TR_i = max(high_i − low_i, |high_i − close_{i−1}|, |low_i − close_{i−1}|)\n' +
    'ATR_first = mean(TR_1 … TR_14)\n' +
    'ATR_t = (ATR_{t−1} × 13 + TR_t) / 14',
  workedExample: {
    narrative:
      'Toy series with period 3 so you can see the steps. TIP production uses period 14 with the same method.',
    periodNote: 'Example uses N=3; TIP uses 14.',
    inputs: [
      { label: 'Bar 1 close', value: '100' },
      { label: 'Bar 2 H/L/C', value: '105 / 99 / 103' },
      { label: 'Bar 3 H/L/C', value: '104 / 100 / 101' },
      { label: 'Bar 4 H/L/C', value: '108 / 102 / 107' },
    ],
    steps: [
      'TR2 = max(105−99, |105−100|, |99−100|) = max(6, 5, 1) = 6',
      'TR3 = max(104−100, |104−103|, |100−103|) = max(4, 1, 3) = 4',
      'TR4 = max(108−102, |108−101|, |102−101|) = max(6, 7, 1) = 7',
      'First ATR (N=3) = (6 + 4 + 7) / 3 = 5.67',
      'If a next TR were 3: ATR = (5.67×2 + 3) / 3 ≈ 4.78',
    ],
    result:
      'TIP would report ATR ≈ 5.67 after the first full window (with N=3). With N=14 it waits for more bars, then uses Wilder smoothing the same way.',
  },
  tipParameters: [
    tipParam('indicators.atr.period', 'Default Wilder period (AtrIndicator.DEFAULT_PERIOD)'),
    tipParam('atr_period', 'Settings field used by pattern detectors for ATR length'),
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'indicator', slug: 'donchian-20', label: 'Donchian (20)' },
    { kind: 'pattern', slug: 'breakout', label: 'Breakout' },
    { kind: 'pattern', slug: 'breakdown', label: 'Breakdown' },
  ],
  sourceDocs: ['docs/indicators/atr-14.md'],
  sourceCode: ['backend/app/indicators/atr.py'],
  lastReviewed: '2026-08-03',
}

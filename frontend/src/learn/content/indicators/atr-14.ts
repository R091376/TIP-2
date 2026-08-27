import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'
import { ATR_SOURCES } from '../learnSources'

export const atr14: LearnTopic = {
  kind: 'indicator',
  slug: 'atr-14',
  title: 'ATR (14)',
  shortDescription: 'How big is a normal candle move? TIP’s volatility yardstick.',
  group: 'indicator',
  plottedOnChart: true,
  plainEnglish: [
    'ATR means Average True Range. It answers: “How large is a typical move for this symbol on this timeframe?”',
    'TIP plots Wilder ATR(14) in its own pane under price (amber line), computed on the chart from the same candles. Pattern detectors use the same formula for retest bands, targets, and the R-unit.',
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
      'Toy series with period 3 so you can see the steps. TIP production uses period 14 with the same method. Patterns freeze ATR at detect as the R-unit.',
    periodNote: 'Example uses N=3; TIP uses 14.',
    inputs: [
      { label: 'Bar 1 close', value: '100' },
      { label: 'Bar 2 H/L/C', value: '105 / 99 / 103' },
      { label: 'Bar 3 H/L/C', value: '104 / 100 / 101' },
      { label: 'Bar 4 H/L/C', value: '108 / 102 / 107' },
    ],
    steps: [
      'TR2 = max(105−99, |105−100|, |99−100|) = 6',
      'TR3 = max(104−100, |104−103|, |100−103|) = 4',
      'TR4 = max(108−102, |108−101|, |102−101|) = 7',
      'First ATR (N=3) = (6+4+7)/3 = 5.67',
    ],
    result:
      'TIP would report ATR ≈ 5.67 after the first full toy window. With N=14 it waits for more bars, then uses Wilder smoothing the same way.',
    scenarios: [
      {
        id: 'compute',
        title: 'Compute ATR (toy N=3)',
        narrative:
          'ATR is not a buy/sell signal. It is a size ruler. We use a tiny period so the arithmetic is obvious.',
        periodNote: 'Example uses N=3; TIP production uses 14 with the same Wilder method.',
        setup: [
          { label: 'Prior close (bar 1)', value: '100' },
          { label: 'Bar 2 H/L/C', value: '105 / 99 / 103' },
          { label: 'Bar 3 H/L/C', value: '104 / 100 / 101' },
          { label: 'Bar 4 H/L/C', value: '108 / 102 / 107' },
        ],
        diagram: {
          type: 'bars',
          title: 'True ranges → first ATR (toy N=3)',
          caption:
            'Each bar is one true range (TR2=6, TR3=4, TR4=7). Dashed line is first ATR = average = 5.67. Production uses N=14 with the same idea.',
          bars: [
            { label: 'TR2', value: 6, note: 'max(6,5,1)' },
            { label: 'TR3', value: 4, note: 'max(4,1,3)' },
            { label: 'TR4', value: 7, note: 'max(6,7,1)' },
          ],
          averageLine: { value: 5.67, label: 'First ATR' },
        },
        timeline: [
          {
            label: 'Bar 2',
            ohlc: 'H 105 / L 99 / C 103',
            note: 'TR = max(6, 5, 1) = 6 (includes gap vs prior close 100).',
          },
          {
            label: 'Bar 3',
            ohlc: 'H 104 / L 100 / C 101',
            note: 'TR = max(4, 1, 3) = 4.',
          },
          {
            label: 'Bar 4',
            ohlc: 'H 108 / L 102 / C 107',
            note: 'TR = max(6, 7, 1) = 7. First ATR = mean(6,4,7) = 5.67.',
          },
        ],
        scoreboards: [
          {
            label: 'After first ATR',
            rows: [
              { metric: 'ATR', value: '≈ 5.67' },
              { metric: 'If next TR = 3', value: 'ATR = (5.67×2 + 3)/3 ≈ 4.78' },
            ],
          },
        ],
        steps: [
          'True range takes the largest of bar height and gap distances to prior close.',
          'First ATR averages the first N true ranges.',
          'Later bars use Wilder smoothing so ATR changes gradually.',
        ],
        result:
          'With enough bars, TIP always has an ATR number patterns can freeze at detect.',
      },
      {
        id: 'consume',
        title: 'How patterns use ATR',
        narrative:
          'When Breakout detects, it freezes atr_at_detect. That single number drives retest distance, strengthen distance, the no-retest target, and R for MFE/MAE.',
        setup: [
          { label: 'Example frozen ATR', value: '2' },
          { label: 'Breakout reference', value: '100' },
          { label: 'No-retest target', value: '100 + 2×2 = 104' },
          { label: 'Retest band (0.25×ATR)', value: 'within 0.5 of reference' },
          { label: 'If entry 101 and best high 104.3', value: 'MFE(R) = (104.3−101)/2 = 1.65 R' },
        ],
        diagram: {
          type: 'candles',
          title: 'How breakout consumes ATR = 2',
          caption:
            'Same rails as the Breakout success story: stop/ref at 100, entry 101, target = ref + 2×ATR = 104. ATR is the yardstick, not a signal by itself.',
          candles: [
            { o: 100.5, h: 101.5, l: 100.2, c: 101, label: 'Detect', emphasis: true },
            { o: 101.2, h: 102.0, l: 100.5, c: 101.8, label: 'B1' },
            { o: 101.2, h: 104.3, l: 101.5, c: 103.9, label: 'Target' },
          ],
          levels: [
            { price: 104, label: 'Tgt 2×ATR', kind: 'target' },
            { price: 101, label: 'Entry', kind: 'entry' },
            { price: 100, label: 'Ref/Stop', kind: 'reference' },
          ],
        },
        steps: [
          'ATR answers “how big is normal?” so a ₹2 stock and a ₹2000 stock can share the same R language.',
          'Patterns that need ATR will not open while ATR is still warming up.',
          'Open the Breakout Learn page for a full trade timeline using ATR = 2.',
        ],
        result:
          'ATR itself does not detect breakouts — breakout/breakdown/pinbars/etc. consume ATR as a yardstick.',
      },
    ],
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
  externalSources: ATR_SOURCES,
  lastReviewed: '2026-08-04',
}

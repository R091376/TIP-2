import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'
import { DONCHIAN_SOURCES } from '../learnSources'

export const donchian20: LearnTopic = {
  kind: 'indicator',
  slug: 'donchian-20',
  title: 'Donchian (20)',
  shortDescription: 'Highest high and lowest low over a lookback — the breakout ceiling/floor.',
  group: 'indicator',
  plottedOnChart: false,
  plainEnglish: [
    'Donchian channels track the highest high and lowest low over the last N bars.',
    'For breakouts, TIP uses the prior window: the N bars before the signal bar, so the signal cannot raise its own ceiling or lower its own floor.',
    'TIP does not plot Donchian on the chart; breakout and breakdown read it behind the scenes.',
  ],
  howWeCalculate: [
    'Highest high = max of highs in the window; lowest low = min of lows in the window.',
    'Prior highest high at signal time t uses bars t−N … t−1 (excludes t).',
    'Breakout detects when close_t > prior highest high; breakdown when close_t < prior lowest low.',
  ],
  formulaPlain:
    'Prior ceiling = max high of the previous 20 bars (not including the signal bar). Prior floor = min low of those same bars.',
  formulaFormal:
    'highest_high(window) = max(high of bars in window)\n' +
    'lowest_low(window) = min(low of bars in window)\n' +
    'prior_highest_high at t = max(high_{t−20} … high_{t−1})\n' +
    'prior_lowest_low at t = min(low_{t−20} … low_{t−1})',
  workedExample: {
    narrative: 'Five toy highs; TIP uses 20 in production with the same prior-window idea.',
    periodNote: 'Example uses N=5 prior bars; TIP uses 20.',
    inputs: [
      { label: 'Prior highs (oldest→newest)', value: '100, 102, 101, 105, 103' },
      { label: 'Signal bar high / close', value: '108 / 107' },
    ],
    steps: [
      'Prior window highs = 100, 102, 101, 105, 103',
      'prior_highest_high = 105 (signal 108 is excluded)',
      'Close 107 > 105 → price break above prior ceiling',
    ],
    result:
      'TIP would treat 105 as the frozen breakout reference if the rest of the breakout rules pass.',
    scenarios: [
      {
        id: 'prior-window',
        title: 'Prior window (correct — excludes signal bar)',
        narrative:
          'The key beginner trap: if you include the signal bar’s high in the ceiling, a breakout bar can never break above itself.',
        periodNote: 'Example uses N=5; TIP uses 20 with the same exclude-signal idea.',
        setup: [
          { label: 'Prior highs', value: '100, 102, 101, 105, 103' },
          { label: 'Signal high / close', value: '108 / 107' },
        ],
        diagram: {
          type: 'candles',
          title: 'Prior window max = 105; signal closes above',
          caption:
            'First five bars are the prior window (signal excluded). Yellow line is prior highest high 105. Signal close 107 > 105 qualifies as a ceiling break.',
          candles: [
            { o: 99, h: 100, l: 98, c: 99.5, label: 'P1' },
            { o: 100, h: 102, l: 99.5, c: 101, label: 'P2' },
            { o: 101, h: 101, l: 100, c: 100.5, label: 'P3' },
            { o: 100.5, h: 105, l: 100, c: 104, label: 'P4' },
            { o: 103, h: 103, l: 101, c: 102, label: 'P5' },
            { o: 104, h: 108, l: 103, c: 107, label: 'Signal', emphasis: true },
          ],
          levels: [{ price: 105, label: 'Prior HH', kind: 'reference' }],
        },
        timeline: [
          {
            label: 'Prior window',
            ohlc: 'highs 100…103',
            note: 'Max = 105. This is the ceiling reference.',
          },
          {
            label: 'Signal bar',
            ohlc: 'H 108 / C 107',
            note: 'close 107 > 105 → qualifies as a break above the prior ceiling (for breakout’s price leg).',
          },
        ],
        scoreboards: [
          {
            label: 'References',
            rows: [
              { metric: 'Prior highest high', value: '105' },
              { metric: 'If signal were included', value: 'max would be 108 (wrong for TIP)' },
            ],
          },
        ],
        steps: [
          'Build the window from bars before the signal only.',
          'Freeze that max high (or min low for breakdown) at detect.',
          'Later lifecycle uses the frozen reference, not a moving channel.',
        ],
        result:
          'TIP freezes reference = 105 for a long breakout story. See the Breakout page for entry/stop/target after detect.',
      },
      {
        id: 'no-break',
        title: 'No break (close still under ceiling)',
        narrative: 'A high wick above the ceiling is not enough — breakout needs close above the prior high.',
        setup: [
          { label: 'Prior highest high', value: '105' },
          { label: 'Signal H/L/C', value: '106 / 103 / 104' },
        ],
        diagram: {
          type: 'candles',
          title: 'Wick above ceiling, close still under — no detect',
          caption:
            'High 106 pokes through the prior high 105, but close 104 stays under. Breakout needs close > prior high.',
          candles: [
            { o: 100.5, h: 105, l: 100, c: 104, label: 'Prior peak' },
            { o: 103.5, h: 103, l: 101, c: 102, label: 'Prior' },
            { o: 103, h: 106, l: 103, c: 104, label: 'Signal', emphasis: true },
          ],
          levels: [{ price: 105, label: 'Prior HH', kind: 'reference' }],
        },
        steps: [
          'High 106 poked above 105, but close 104 is not > 105.',
          'Breakout detector does not fire on this bar.',
        ],
        result: 'TIP would not Detect breakout — the close must clear the prior ceiling.',
      },
    ],
  },
  tipParameters: [
    tipParam('indicators.donchian.period', 'Lookback length for high/low channel (DEFAULT_PERIOD = 20)'),
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'indicator', slug: 'atr-14', label: 'ATR (14)' },
    { kind: 'pattern', slug: 'breakout', label: 'Breakout' },
    { kind: 'pattern', slug: 'breakdown', label: 'Breakdown' },
  ],
  sourceDocs: ['docs/indicators/donchian-20.md'],
  sourceCode: ['backend/app/indicators/donchian.py'],
  externalSources: DONCHIAN_SOURCES,
  lastReviewed: '2026-08-04',
}

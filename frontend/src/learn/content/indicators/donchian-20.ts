import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const donchian20: LearnTopic = {
  kind: 'indicator',
  slug: 'donchian-20',
  title: 'Donchian (20)',
  shortDescription: 'Highest high and lowest low over a lookback — the ceiling and floor for breakouts.',
  group: 'indicator',
  plottedOnChart: false,
  plainEnglish: [
    'A Donchian channel is simply: over the last N bars, what was the highest high and the lowest low?',
    'Breakout and breakdown patterns use the prior window: they look at the previous 20 bars only, not including the bar that might break out. That way the signal bar cannot raise the ceiling against itself.',
    'TIP does not draw Donchian lines on the chart; detectors compute them when a candle closes.',
  ],
  howWeCalculate: [
    'Take a list of closed candles in time order.',
    'For “highest high over 20”, find the maximum high among those 20 bars.',
    'For “lowest low over 20”, find the minimum low among those 20 bars.',
    'For breakouts, use prior_highest_high / prior_lowest_low: the window is the 20 bars before the signal bar (signal bar excluded).',
    'If fewer than 20 closed bars exist, there is no Donchian level yet.',
  ],
  formulaPlain:
    'Reference high for a breakout = maximum high of the 20 closed bars before the signal bar. Reference low for a breakdown = minimum low of those same prior bars.',
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
      'prior_highest_high = 105 (signal bar 108 is not in the window)',
      'Close 107 > 105 → would qualify as a price break above the prior ceiling',
    ],
    result:
      'TIP would treat 105 as the frozen breakout reference if the rest of the breakout rules pass. Including the signal bar would have used 108 and blocked the break — that is why the prior window matters.',
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
  lastReviewed: '2026-08-03',
}

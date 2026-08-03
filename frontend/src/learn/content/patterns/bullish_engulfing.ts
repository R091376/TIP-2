import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const bullishEngulfing: LearnTopic = {
  kind: 'pattern',
  slug: 'bullish_engulfing',
  title: 'Bullish engulfing',
  shortDescription: 'A green body that fully covers the prior red body — two-bar bullish reversal shape.',
  group: 'candlestick',
  direction: 'long',
  plottedOnChart: false,
  plainEnglish: [
    'Bullish engulfing needs two closed bars: a bearish bar, then a larger bullish bar whose body covers the prior body.',
    'TIP also requires the signal bar range to be meaningful vs ATR so tiny bars do not fire.',
    'After detect, a short virtual trade tracks confirmation above the signal high and a 1.5×ATR target.',
  ],
  howWeCalculate: [
    'Prior bar must be bearish (close < open); signal bullish (close > open).',
    'Signal open ≤ prior close and signal close ≥ prior open (body engulfs).',
    'Signal range ≥ 0.5×ATR.',
    'Entry at signal close; stop near the two-bar low; confirm on later close above signal high.',
  ],
  formulaPlain:
    'Second bar is green and its body completely covers the first bar’s body; bar is large enough vs ATR.',
  formulaFormal:
    'close_{t−1} < open_{t−1}; close_t > open_t\n' +
    'open_t ≤ close_{t−1} and close_t ≥ open_{t−1}\n' +
    'range_t ≥ 0.5×ATR',
  workedExample: {
    narrative: 'Red bar 105→102, then green bar opens 101.5 and closes 106.',
    inputs: [
      { label: 'Prior O/C', value: '105 / 102' },
      { label: 'Signal O/C', value: '101.5 / 106' },
      { label: 'ATR', value: '2' },
    ],
    steps: [
      'Prior bearish, signal bullish',
      '101.5 ≤ 102 and 106 ≥ 105 → body engulfs',
      'If range ≥ 0.5×ATR → Detected long',
    ],
    result: 'TIP would Detect bullish_engulfing when geometry and ATR filter pass.',
  },
  tipParameters: [
    tipParam('engulfing.min_range_atr_mult', 'Min signal range vs ATR'),
    tipParam('engulfing.success_atr_mult', 'Target distance in ATR'),
    tipParam('engulfing.max_candles_after_detect', 'Max bars after detect'),
    tipParam('engulfing.detector_version', 'Journal version tag', { advanced: true }),
    tipParam('atr_period', 'ATR length'),
  ],
  lifecycle: [
    'Detected: body engulf + ATR size filter',
    'Confirmed: later close > signal high',
    'Succeeded: entry + ~1.5×ATR',
    'Failed: close below two-bar low stop',
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'pattern', slug: 'bearish_engulfing', label: 'Bearish engulfing' },
    { kind: 'pattern', slug: 'hammer', label: 'Hammer' },
  ],
  patternTypeId: 'bullish_engulfing',
  sourceDocs: ['docs/patterns/engulfing.md'],
  sourceCode: ['backend/app/patterns/engulfing.py'],
  lastReviewed: '2026-08-03',
  detectorVersionHint: 'engulfing-v1',
}

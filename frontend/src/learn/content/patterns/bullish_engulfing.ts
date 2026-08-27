import { LONG_TRADE_RULES_VS_MEASUREMENTS } from '../../exampleBlocks'
import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'
import { BULLISH_ENGULFING_SOURCES } from '../learnSources'

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
    narrative: 'Red 105→102, then green opens 101.5 closes 106; ATR 2 → detect long.',
    inputs: [
      { label: 'Prior O/C', value: '105 / 102' },
      { label: 'Signal O/H/L/C', value: '101.5 / 106.5 / 101 / 106' },
      { label: 'ATR', value: '2' },
    ],
    steps: [
      'Bodies engulf + range OK → Detected',
      'Entry 106; target 106+3=109; stop near two-bar low',
    ],
    result: 'Long bullish_engulfing with short lifecycle.',
    scenarios: [
      {
        id: 'success',
        title: 'Two-bar detect → target success',
        narrative:
          'Detect needs both bars closed. Rails freeze on the engulfing bar. Later bars update MFE/MAE and apply stop/target.',
        setup: [
          { label: 'Prior (bearish) O/C', value: '105 / 102' },
          { label: 'Signal O/H/L/C', value: '101.5 / 106.5 / 101 / 106' },
          { label: 'ATR', value: '2' },
          { label: 'Entry / target', value: '106 / 109 (1.5×ATR)' },
          { label: 'Stop region', value: 'near min lows of the two bars (~101)' },
        ],
        diagram: {
          type: 'candles',
          title: 'Bullish engulfing → long to target',
          caption:
            'Red prior bar, then green body engulfs. Entry 106, stop ~101, target 109. Later high clears target.',
          candles: [
            { o: 105, h: 105.5, l: 101.5, c: 102, label: 'Prior' },
            { o: 101.5, h: 106.5, l: 101, c: 106, label: 'Detect', emphasis: true },
            { o: 106, h: 108, l: 105, c: 107, label: 'B1' },
            { o: 107, h: 110, l: 107, c: 109.5, label: 'B2 win' },
          ],
          levels: [
            { price: 109, label: 'Target', kind: 'target' },
            { price: 106, label: 'Entry', kind: 'entry' },
            { price: 101, label: 'Stop', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: 'Prior bar',
            ohlc: 'O 105 / C 102',
            note: 'Bearish body — first half of the pattern (not a detect yet).',
          },
          {
            label: 'Bar 0 (detect)',
            ohlc: 'O 101.5 / H 106.5 / L 101 / C 106',
            note: 'Bullish body engulfs prior body; range ≥ 0.5×ATR → Detected long.',
          },
          {
            label: 'Bar 1',
            ohlc: 'H 108 / L 105 / C 107',
            note: 'Path updates; may confirm above signal high 106.5. Still open.',
          },
          {
            label: 'Bar 2 (target)',
            ohlc: 'H 110 / L 107 / C 109.5',
            note: 'High ≥ 109 → Succeeded.',
          },
        ],
        scoreboards: [
          {
            label: 'Final',
            rows: [
              { metric: 'Outcome', value: 'Succeeded' },
              { metric: 'MFE (R)', value: '(110−106)/2 = 2.0 R' },
              { metric: 'MAE (R)', value: '(106−101)/2 = 2.5 R' },
            ],
          },
        ],
        steps: [
          'Body engulf is about open/close relationships, not necessarily full wicks.',
          'ATR size filter blocks micro engulfs.',
          'Stop uses the two-bar low region; target is ATR-based from entry.',
        ],
        rulesVsMeasurements: { ...LONG_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Succeeded engulfing long; MFE/MAE both journaled.',
      },
      {
        id: 'fail',
        title: 'Fail through two-bar low stop',
        narrative: 'After detect, price closes back under the stop region → Failed.',
        setup: [{ label: 'Entry / stop', value: '106 / ~101' }],
        diagram: {
          type: 'candles',
          title: 'Bullish engulfing fail under stop',
          caption: 'After detect, close under the two-bar low stop ~101 → Failed.',
          candles: [
            { o: 105, h: 105.5, l: 101.5, c: 102, label: 'Prior' },
            { o: 101.5, h: 106.5, l: 101, c: 106, label: 'Detect', emphasis: true },
            { o: 105, h: 105, l: 99, c: 100, label: 'Fail' },
          ],
          levels: [
            { price: 109, label: 'Target', kind: 'target' },
            { price: 106, label: 'Entry', kind: 'entry' },
            { price: 101, label: 'Stop', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: 'Bar 0',
            ohlc: 'H 106.5 / L 101 / C 106',
            note: 'Detected.',
          },
          {
            label: 'Bar 1 (fail)',
            ohlc: 'H 105 / L 99 / C 100',
            note: 'close under stop → Failed. MAE uses worst low 99.',
          },
        ],
        steps: [
          'Even a clean engulf can fail quickly — journal keeps path metrics either way.',
        ],
        rulesVsMeasurements: { ...LONG_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Failed bullish_engulfing with MFE/MAE present.',
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
  externalSources: BULLISH_ENGULFING_SOURCES,
  lastReviewed: '2026-08-04',
  detectorVersionHint: 'engulfing-v1',
}

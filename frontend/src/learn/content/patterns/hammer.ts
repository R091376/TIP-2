import { LONG_TRADE_RULES_VS_MEASUREMENTS } from '../../exampleBlocks'
import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const hammer: LearnTopic = {
  kind: 'pattern',
  slug: 'hammer',
  title: 'Hammer',
  shortDescription: 'Long lower wick, small body — potential bullish pin after pressure lower.',
  group: 'candlestick',
  direction: 'long',
  plottedOnChart: false,
  plainEnglish: [
    'A hammer is a pin-bar shape: a small real body near the top of the range and a long lower shadow, suggesting buyers pushed back after selling.',
    'TIP only uses closed bars and applies size filters vs ATR so tiny noise bars do not count.',
    'By default it also wants simple downtrend context so the shape is more reversal-like.',
  ],
  howWeCalculate: [
    'On the signal bar: body = |close−open|, range = high−low, lower wick, upper wick.',
    'Require range ≥ 0.5×ATR, body ≤ 0.35×range, lower wick ≥ 2×body, upper wick ≤ 0.25×range.',
    'If require_trend_context is on, check a simple prior down-bias over trend_lookback.',
    'Detected → short lifecycle to confirm higher, hit 1.5×ATR target, or fail.',
  ],
  formulaPlain:
    'Long lower shadow at least twice the body; small body; tiny upper wick; bar not microscopic vs ATR.',
  formulaFormal:
    'body = |close − open|; range = high − low\n' +
    'lower ≥ 2×body; upper ≤ 0.25×range; body ≤ 0.35×range\n' +
    'range ≥ 0.5×ATR',
  workedExample: {
    narrative: 'Bar opens 100, trades to 94, closes 99.5; ATR is 4. Geometry passes → long pin lifecycle.',
    inputs: [
      { label: 'O/H/L/C', value: '100 / 100.2 / 94 / 99.5' },
      { label: 'ATR', value: '4' },
    ],
    steps: [
      'body 0.5, range 6.2, lower ~5.5 → geometry OK',
      'Entry ~99.5; target ~99.5+1.5×4; stop under the pin low',
    ],
    result: 'Detected hammer when geometry (+ context) pass.',
    scenarios: [
      {
        id: 'success',
        title: 'Detect geometry → target success',
        narrative:
          'First TIP checks candle geometry on the closed bar. If it passes, it freezes a virtual long with stop under the pin and target about 1.5×ATR above entry.',
        setup: [
          { label: 'Signal O/H/L/C', value: '100 / 100.2 / 94 / 99.5' },
          { label: 'ATR', value: '4' },
          { label: 'body / range / lower / upper', value: '0.5 / 6.2 / ≈5.5 / ≈0.2' },
          { label: 'Entry (close)', value: '99.5' },
          { label: 'Stop (under pin)', value: 'near 94' },
          { label: 'Target (~1.5×ATR)', value: '99.5 + 6 = 105.5' },
        ],
        diagram: {
          type: 'candles',
          title: 'Hammer — long lower wick then run to target',
          caption:
            'Detect bar shows the pin (long lower shadow). Stop under the low (94), entry at close (99.5), target at 105.5. Later bars push up into the target.',
          candles: [
            { o: 100, h: 100.2, l: 94, c: 99.5, label: 'B0 pin', emphasis: true },
            { o: 99.5, h: 102, l: 98, c: 101, label: 'B1' },
            { o: 101, h: 106, l: 101, c: 105, label: 'B2 win' },
          ],
          levels: [
            { price: 105.5, label: 'Target', kind: 'target' },
            { price: 99.5, label: 'Entry', kind: 'entry' },
            { price: 94, label: 'Stop', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: 'Bar 0 (detect)',
            ohlc: 'O 100 / H 100.2 / L 94 / C 99.5',
            note: 'range ≥ 0.5×ATR, lower ≥ 2×body, small upper → Detected long hammer. Path starts high 100.2 / low 94.',
          },
          {
            label: 'Bar 1',
            ohlc: 'H 102 / L 98 / C 101',
            note: 'Update MFE/MAE. May confirm if close clears signal high. Still open.',
          },
          {
            label: 'Bar 2 (target)',
            ohlc: 'H 106 / L 101 / C 105',
            note: 'High ≥ 105.5 → Succeeded.',
          },
        ],
        scoreboards: [
          {
            label: 'Final',
            rows: [
              { metric: 'Outcome', value: 'Succeeded' },
              { metric: 'MFE (R)', value: '(106−99.5)/4 ≈ 1.63 R' },
              { metric: 'MAE (R)', value: '(99.5−94)/4 ≈ 1.38 R (pin low on detect counts)' },
            ],
          },
        ],
        steps: [
          'Geometry is checked only on closed bars.',
          'ATR filters out tiny pins.',
          'After detect, the short lifecycle is the same family as other long virtual trades (confirm / target / stop).',
        ],
        rulesVsMeasurements: { ...LONG_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Succeeded hammer: target rule ends the trade; MFE/MAE still describe the path.',
      },
      {
        id: 'fail',
        title: 'Fail through stop under the pin',
        narrative: 'After detect, a closed bar finishes under the pin low → Failed. MFE may still show a bounce first.',
        setup: [
          { label: 'Entry / stop', value: '99.5 / ~94' },
        ],
        diagram: {
          type: 'candles',
          title: 'Hammer fail — close under pin low',
          caption:
            'After a small bounce (B1), B2 closes under the stop near 94 → Failed. MFE from the bounce is still kept.',
          candles: [
            { o: 100, h: 100.2, l: 94, c: 99.5, label: 'B0 pin', emphasis: true },
            { o: 99.5, h: 101, l: 97, c: 100, label: 'B1' },
            { o: 99, h: 98, l: 92, c: 93, label: 'B2 fail' },
          ],
          levels: [
            { price: 105.5, label: 'Target', kind: 'target' },
            { price: 99.5, label: 'Entry', kind: 'entry' },
            { price: 94, label: 'Stop', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: 'Bar 0',
            ohlc: 'H 100.2 / L 94 / C 99.5',
            note: 'Detected.',
          },
          {
            label: 'Bar 1',
            ohlc: 'H 101 / L 97 / C 100',
            note: 'Small bounce — some MFE. Still open.',
          },
          {
            label: 'Bar 2 (fail)',
            ohlc: 'H 98 / L 92 / C 93',
            note: 'close under stop → Failed. MAE uses the worst low.',
          },
        ],
        steps: [
          'Stop lives under the hammer’s low region.',
          'Failure still records how far price went in favor first (MFE).',
        ],
        rulesVsMeasurements: { ...LONG_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Failed hammer with both MFE and MAE present.',
      },
    ],
  },
  tipParameters: [
    tipParam('pinbar.shadow_body_mult', 'Dominant wick must be ≥ this × body'),
    tipParam('pinbar.max_body_range_ratio', 'Max body as fraction of full range'),
    tipParam('pinbar.max_opposite_wick_range_ratio', 'Max opposite wick as fraction of range'),
    tipParam('pinbar.min_range_atr_mult', 'Min full range vs ATR'),
    tipParam('pinbar.success_atr_mult', 'Target distance in ATR'),
    tipParam('pinbar.require_trend_context', 'Require simple prior trend bias'),
    tipParam('pinbar.trend_lookback', 'Bars used for trend context'),
    tipParam('pinbar.max_candles_after_detect', 'Max bars after detect'),
    tipParam('pinbar.detector_version', 'Journal version tag', { advanced: true }),
    tipParam('atr_period', 'ATR length'),
  ],
  lifecycle: [
    'Detected: hammer geometry on closed bar (+ optional trend context)',
    'Confirmed: later close beyond signal high',
    'Succeeded: ~1.5×ATR from entry',
    'Failed: close through stop under the pin',
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'pattern', slug: 'shooting_star', label: 'Shooting star' },
    { kind: 'pattern', slug: 'bullish_engulfing', label: 'Bullish engulfing' },
    { kind: 'indicator', slug: 'atr-14', label: 'ATR (14)' },
  ],
  patternTypeId: 'hammer',
  sourceDocs: ['docs/patterns/hammer-shooting-star.md'],
  sourceCode: ['backend/app/patterns/pinbar.py'],
  lastReviewed: '2026-08-04',
  detectorVersionHint: 'pinbar-v1',
}

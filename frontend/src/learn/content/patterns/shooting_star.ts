import { SHORT_TRADE_RULES_VS_MEASUREMENTS } from '../../exampleBlocks'
import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'
import { SHOOTING_STAR_SOURCES } from '../learnSources'

export const shootingStar: LearnTopic = {
  kind: 'pattern',
  slug: 'shooting_star',
  title: 'Shooting star',
  shortDescription: 'Long upper wick, small body — potential bearish pin after a push higher.',
  group: 'candlestick',
  direction: 'short',
  plottedOnChart: false,
  plainEnglish: [
    'A shooting star is the upside-down pin: long upper shadow, small body near the lows of the range — sellers rejected higher prices.',
    'TIP shares the same pinbar geometry package as hammer, but flipped, and treats it as a short setup.',
    'Closed candles only; optional prior uptrend context when enabled.',
  ],
  howWeCalculate: [
    'Measure body, range, upper and lower wicks on the closed signal bar.',
    'Require upper wick ≥ 2×body, lower wick ≤ 0.25×range, body ≤ 0.35×range, range ≥ 0.5×ATR.',
    'Optional trend context: simple prior up-bias.',
    'Short lifecycle: confirm lower, target 1.5×ATR, or fail.',
  ],
  formulaPlain:
    'Long upper shadow at least twice the body; small body; tiny lower wick; meaningful range vs ATR.',
  formulaFormal:
    'upper ≥ 2×body; lower ≤ 0.25×range; body ≤ 0.35×range\n' +
    'range ≥ 0.5×ATR',
  workedExample: {
    narrative: 'Bar spikes to 110 then closes 101; ATR is 3. Geometry passes → short pin lifecycle.',
    inputs: [
      { label: 'O/H/L/C', value: '102 / 110 / 100.8 / 101' },
      { label: 'ATR', value: '3' },
    ],
    steps: [
      'upper large, body small → Detected short',
      'Target ≈ entry − 1.5×ATR; stop above the pin high',
    ],
    result: 'Detected shooting star when rules pass.',
    scenarios: [
      {
        id: 'success',
        title: 'Detect → downside target success',
        narrative:
          'Geometry on the closed bar starts a virtual short. Favorable path is lower prices; stop sits above the upper wick region.',
        setup: [
          { label: 'Signal O/H/L/C', value: '102 / 110 / 100.8 / 101' },
          { label: 'ATR', value: '3' },
          { label: 'Entry', value: '101' },
          { label: 'Stop (above pin)', value: 'near 110' },
          { label: 'Target (~1.5×ATR)', value: '101 − 4.5 = 96.5' },
        ],
        diagram: {
          type: 'candles',
          title: 'Shooting star — upper wick then drop to target',
          caption:
            'Detect pin has a long upper shadow. Stop near 110, entry 101, target 96.5. Later bars push lower into the target.',
          candles: [
            { o: 102, h: 110, l: 100.8, c: 101, label: 'B0 pin', emphasis: true },
            { o: 101, h: 102, l: 98, c: 99, label: 'B1' },
            { o: 99, h: 98, l: 96, c: 96.8, label: 'B2 win' },
          ],
          levels: [
            { price: 110, label: 'Stop', kind: 'stop' },
            { price: 101, label: 'Entry', kind: 'entry' },
            { price: 96.5, label: 'Target', kind: 'target' },
          ],
        },
        timeline: [
          {
            label: 'Bar 0 (detect)',
            ohlc: 'O 102 / H 110 / L 100.8 / C 101',
            note: 'Upper wick dominates → Detected short. Path extremes start here.',
          },
          {
            label: 'Bar 1',
            ohlc: 'H 102 / L 98 / C 99',
            note: 'Price falls — MFE grows for the short. Still open if above target.',
          },
          {
            label: 'Bar 2 (target)',
            ohlc: 'H 98 / L 96 / C 96.8',
            note: 'Low ≤ 96.5 → Succeeded.',
          },
        ],
        scoreboards: [
          {
            label: 'Final',
            rows: [
              { metric: 'Outcome', value: 'Succeeded' },
              { metric: 'MFE (R) short', value: '(101−96)/3 ≈ 1.67 R' },
              { metric: 'MAE (R) short', value: 'includes spike toward 110 on detect path' },
            ],
          },
        ],
        steps: [
          'Same pin package as hammer, flipped for shorts.',
          'Target uses success_atr_mult (default 1.5) from entry.',
        ],
        rulesVsMeasurements: { ...SHORT_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Succeeded shooting star with MFE/MAE both recorded.',
      },
      {
        id: 'fail',
        title: 'Fail — close reclaims above the pin',
        narrative: 'After detect, price rips back through the stop above the star → Failed.',
        setup: [{ label: 'Entry / stop', value: '101 / ~110' }],
        diagram: {
          type: 'candles',
          title: 'Shooting star fail — reclaim above pin high',
          caption:
            'B1 dips (short MFE). B2 closes above stop ~110 → Failed; MAE captures the squeeze higher.',
          candles: [
            { o: 102, h: 110, l: 100.8, c: 101, label: 'B0 pin', emphasis: true },
            { o: 101, h: 103, l: 99, c: 100, label: 'B1' },
            { o: 101, h: 112, l: 104, c: 111, label: 'B2 fail' },
          ],
          levels: [
            { price: 110, label: 'Stop', kind: 'stop' },
            { price: 101, label: 'Entry', kind: 'entry' },
            { price: 96.5, label: 'Target', kind: 'target' },
          ],
        },
        timeline: [
          {
            label: 'Bar 0',
            ohlc: 'H 110 / L 100.8 / C 101',
            note: 'Detected short.',
          },
          {
            label: 'Bar 1',
            ohlc: 'H 103 / L 99 / C 100',
            note: 'Some follow-through lower (MFE). Still open.',
          },
          {
            label: 'Bar 2 (fail)',
            ohlc: 'H 112 / L 104 / C 111',
            note: 'close above stop → Failed. MAE reflects the adverse run-up.',
          },
        ],
        steps: [
          'Short fails when price closes through the stop above the pin.',
          'MFE can still be non-zero if price dipped first.',
        ],
        rulesVsMeasurements: { ...SHORT_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Failed shooting star — both path metrics kept.',
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
    'Detected: shooting-star geometry on closed bar',
    'Confirmed: later close below signal low',
    'Succeeded: ~1.5×ATR downside',
    'Failed: close through stop above the pin',
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'pattern', slug: 'hammer', label: 'Hammer' },
    { kind: 'pattern', slug: 'bearish_engulfing', label: 'Bearish engulfing' },
    { kind: 'indicator', slug: 'atr-14', label: 'ATR (14)' },
  ],
  patternTypeId: 'shooting_star',
  sourceDocs: ['docs/patterns/hammer-shooting-star.md'],
  sourceCode: ['backend/app/patterns/pinbar.py'],
  externalSources: SHOOTING_STAR_SOURCES,
  lastReviewed: '2026-08-04',
  detectorVersionHint: 'pinbar-v1',
}

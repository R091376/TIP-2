import { SHORT_TRADE_RULES_VS_MEASUREMENTS } from '../../exampleBlocks'
import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const breakdown: LearnTopic = {
  kind: 'pattern',
  slug: 'breakdown',
  title: 'Breakdown',
  shortDescription: 'Close below the prior 20-bar low — the short mirror of breakout.',
  group: 'range',
  direction: 'short',
  plottedOnChart: false,
  plainEnglish: [
    'A breakdown is the short-side twin of breakout: price closes below the lowest low of the previous 20 bars (signal bar excluded).',
    'TIP tracks confirmation, retest of the floor from below, extension, and virtual short success/fail the same way as breakout, but mirrored.',
    'Closed candles only; reference is frozen at detect.',
  ],
  howWeCalculate: [
    'Compute prior Donchian low over 20 bars before the signal bar.',
    'Detected when close < that reference (ATR available, anti-spam OK).',
    'Confirmation mirrors breakout: volume and/or later close still below reference.',
    'Retest: high comes within 0.25×ATR of reference without closing back above it.',
    'Succeeded toward a downside target; Failed if close returns above reference.',
  ],
  formulaPlain:
    'Reference = min low of the prior 20 bars. Detected when close < reference. Targets and retests use ATR multiples like breakout, flipped for shorts.',
  formulaFormal:
    'reference = min(low_{t−20} … low_{t−1})\n' +
    'Detected when close_t < reference\n' +
    'retest: high ≥ reference − 0.25×ATR and close ≤ reference',
  workedExample: {
    narrative:
      'Prior floor 50, ATR 2, detect close 49. Short target without retest ≈ 46. Success pushes lower; fail reclaims above 50.',
    inputs: [
      { label: 'Prior Donchian low', value: '50' },
      { label: 'ATR', value: '2' },
      { label: 'Detect close', value: '49' },
      { label: 'No-retest target', value: '50 − 2×2 = 46' },
    ],
    steps: [
      'Detect freezes short entry 49, stop 50, target 46',
      'Favorable = price falling; adverse = price rising',
      'Fail if close > 50; succeed if low ≤ 46',
    ],
    result: 'Same mental model as breakout, mirrored for shorts — both MFE and MAE on every outcome.',
    scenarios: [
      {
        id: 'success',
        title: 'Success path (downside target hit)',
        narrative:
          'Virtual short: profit when price falls. At detect TIP freezes rails. Each bar updates path extremes, then checks reclaim-fail and target-success.',
        setup: [
          { label: 'Reference (prior 20-bar low)', value: '50' },
          { label: 'ATR at detect', value: '2' },
          { label: 'Detect H/L/C', value: '49.8 / 48.5 / 49' },
          { label: 'Entry (detect close)', value: '49' },
          { label: 'Stop (reference)', value: '50' },
          { label: 'Target (no retest)', value: '50 − 2×ATR = 46' },
        ],
        diagram: {
          type: 'candles',
          title: 'Breakdown success — short rails to 46',
          caption:
            'Stop/ref 50, entry 49, target 46. Price works lower; B3 low clears the downside target.',
          candles: [
            { o: 49.5, h: 49.8, l: 48.5, c: 49, label: 'B0 detect', emphasis: true },
            { o: 49, h: 49.5, l: 47.5, c: 48, label: 'B1' },
            { o: 48.2, h: 49.6, l: 47.8, c: 48.5, label: 'B2 bounce' },
            { o: 48, h: 47.0, l: 45.5, c: 46.2, label: 'B3 win' },
          ],
          levels: [
            { price: 50, label: 'Stop/Ref', kind: 'stop' },
            { price: 49, label: 'Entry', kind: 'entry' },
            { price: 46, label: 'Target', kind: 'target' },
          ],
        },
        timeline: [
          {
            label: 'Bar 0 (detect)',
            ohlc: 'H 49.8 / L 48.5 / C 49',
            note: 'close 49 < 50 → Detected short. Freeze entry 49, stop 50, target 46.',
          },
          {
            label: 'Bar 1',
            ohlc: 'H 49.5 / L 47.5 / C 48',
            note: 'Price drops — favorable for short. Still above target 46; close still ≤ 50 → open.',
          },
          {
            label: 'Bar 2 (bounce)',
            ohlc: 'H 49.6 / L 47.8 / C 48.5',
            note: 'Bounce raises adverse excursion (pain for short) but close 48.5 still under stop 50.',
          },
          {
            label: 'Bar 3 (target)',
            ohlc: 'H 47.0 / L 45.5 / C 46.2',
            note: 'Low 45.5 ≤ 46 → Succeeded. Trade ends.',
          },
        ],
        scoreboards: [
          {
            label: 'Final (success)',
            rows: [
              { metric: 'Outcome', value: 'Succeeded' },
              { metric: 'MFE (R) short', value: '(49 − 45.5)/2 = 1.75 R' },
              { metric: 'MAE (R) short', value: '(49.6 − 49)/2 = 0.30 R' },
            ],
          },
        ],
        steps: [
          'Detect when close breaks under the prior floor.',
          'MFE for shorts uses how far price fell from entry; MAE uses how far it rose against you.',
          'Success and fail both keep both measurements.',
        ],
        rulesVsMeasurements: { ...SHORT_TRADE_RULES_VS_MEASUREMENTS },
        result: 'TIP marks Succeeded short with both MFE and MAE filled — target was the win rule.',
      },
      {
        id: 'fail',
        title: 'Fail path (reclaim above reference)',
        narrative: 'Price dips a little, then a closed bar finishes back above the floor → Failed short.',
        setup: [
          { label: 'Rails', value: 'entry 49, stop 50, target 46, ATR 2' },
        ],
        diagram: {
          type: 'candles',
          title: 'Breakdown fail — reclaim above 50',
          caption:
            'B1 dips (MFE for the short). B2 closes back above stop/ref 50 → Failed; MAE uses the adverse high.',
          candles: [
            { o: 49.5, h: 49.8, l: 48.5, c: 49, label: 'B0 detect', emphasis: true },
            { o: 49, h: 49.2, l: 48.0, c: 48.4, label: 'B1' },
            { o: 48.5, h: 50.8, l: 48.8, c: 50.4, label: 'B2 fail' },
          ],
          levels: [
            { price: 50, label: 'Stop/Ref', kind: 'stop' },
            { price: 49, label: 'Entry', kind: 'entry' },
            { price: 46, label: 'Target', kind: 'target' },
          ],
        },
        timeline: [
          {
            label: 'Bar 0 (detect)',
            ohlc: 'H 49.8 / L 48.5 / C 49',
            note: 'Detected short.',
          },
          {
            label: 'Bar 1',
            ohlc: 'H 49.2 / L 48.0 / C 48.4',
            note: 'Some favorable drop (MFE grows). Still open.',
          },
          {
            label: 'Bar 2 (fail)',
            ohlc: 'H 50.8 / L 48.8 / C 50.4',
            note: 'close 50.4 > 50 → Failed (reclaim). Adverse high 50.8 updates MAE.',
          },
        ],
        scoreboards: [
          {
            label: 'Final (failed)',
            rows: [
              { metric: 'Outcome', value: 'Failed' },
              { metric: 'MFE (R)', value: '(49 − 48.0)/2 = 0.50 R' },
              { metric: 'MAE (R)', value: '(50.8 − 49)/2 = 0.90 R' },
            ],
          },
        ],
        steps: [
          'Fail rule: close back above the reference/stop.',
          'You still record how far the short went in favor before failing (MFE).',
        ],
        rulesVsMeasurements: { ...SHORT_TRADE_RULES_VS_MEASUREMENTS },
        result: 'TIP marks Failed with MFE and MAE both present — same scoreboard idea as breakout.',
      },
    ],
  },
  tipParameters: [
    tipParam('breakdown.lookback_candles', 'Bars in the prior low window'),
    tipParam('breakdown.volume_avg_period', 'Bars in prior volume average'),
    tipParam('breakdown.confirmation_mode', 'volume | close | both | close_fallback'),
    tipParam('breakdown.volume_multiplier', 'Volume threshold multiple'),
    tipParam('breakdown.retest_atr_mult', 'Retest band in ATR'),
    tipParam('breakdown.strengthen_atr_mult', 'Extension multiple for Strengthened'),
    tipParam('breakdown.success_rr', 'Reward multiple after retest'),
    tipParam('breakdown.success_atr_mult_without_retest', 'Target in ATR without retest'),
    tipParam('breakdown.detector_version', 'Journal version tag', { advanced: true }),
    tipParam('atr_period', 'ATR length'),
  ],
  lifecycle: [
    'Detected: close below prior 20-low',
    'Confirmed: volume and/or later close still below reference',
    'Retested: bounce near floor without reclaim',
    'Strengthened: extension about 1×ATR beyond floor',
    'Succeeded / Failed / Expired: mirrored short outcomes',
  ],
  closedCandleOnly: true,
  indexVolumeNote:
    'On index symbols or when volume is unusable, confirmation falls back to close-only (CLOSE_FALLBACK).',
  relatedSlugs: [
    { kind: 'pattern', slug: 'breakout', label: 'Breakout' },
    { kind: 'indicator', slug: 'donchian-20', label: 'Donchian (20)' },
    { kind: 'indicator', slug: 'atr-14', label: 'ATR (14)' },
  ],
  patternTypeId: 'breakdown',
  sourceDocs: ['docs/patterns/breakdown.md'],
  sourceCode: ['backend/app/patterns/breakdown.py'],
  lastReviewed: '2026-08-04',
  detectorVersionHint: 'breakdown-v1',
}

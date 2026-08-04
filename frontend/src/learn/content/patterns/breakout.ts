import { LONG_TRADE_RULES_VS_MEASUREMENTS } from '../../exampleBlocks'
import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const breakout: LearnTopic = {
  kind: 'pattern',
  slug: 'breakout',
  title: 'Breakout',
  shortDescription: 'Close above the prior 20-bar high, then track confirmation, retest, and targets.',
  group: 'range',
  direction: 'long',
  plottedOnChart: false,
  plainEnglish: [
    'A breakout means price closed above a recent ceiling — the highest high of the previous 20 bars (not including the breakout bar itself).',
    'TIP then watches whether volume and/or later closes confirm the move, whether price retests the breakout level, and whether a virtual long reaches a target or fails.',
    'This is a long-only setup. Everything runs on closed candles only (no mid-bar repaint).',
  ],
  howWeCalculate: [
    'On each closed bar, compute the prior Donchian high over 20 bars before this bar.',
    'If close > that reference, ATR is available, and anti-spam allows it, emit Detected and freeze the reference.',
    'Confirmation (default both): detect-bar volume ≥ 1.5 × prior volume SMA, and a later bar still closes above reference.',
    'Retest: a later low comes within 0.25×ATR of reference without closing below it.',
    'Strengthen: price extends about 1×ATR beyond reference.',
    'Succeeded: price reaches the target (retest-based or 2×ATR without retest). Failed: close back below reference.',
  ],
  formulaPlain:
    'Reference = max high of the prior 20 bars. Detected when close > reference. Target with retest uses about 2× the risk from retest floor; without retest, about 2×ATR above reference.',
  formulaFormal:
    'reference = max(high_{t−20} … high_{t−1})\n' +
    'Detected when close_t > reference (ATR available)\n' +
    'volume ok: vol_t ≥ 1.5 × prior_SMA20(volume)\n' +
    'retest: low ≤ reference + 0.25×ATR and close ≥ reference\n' +
    'target (no retest) ≈ reference + 2×ATR',
  workedExample: {
    narrative:
      'Prior ceiling 100, ATR 2, detect close 101. Success hits target 104; fail closes back under 100. Both paths track MFE and MAE.',
    inputs: [
      { label: 'Prior Donchian high (reference)', value: '100' },
      { label: 'ATR at detect', value: '2' },
      { label: 'Detect close / high / low', value: '101 / 101.5 / 100.2' },
      { label: 'No-retest target', value: '100 + 2×2 = 104' },
    ],
    steps: [
      'Detect freezes entry 101, stop 100, target 104, ATR 2',
      'Every open bar updates best high (for MFE) and worst low (for MAE)',
      'Fail if close < 100; succeed if high ≥ 104',
    ],
    result:
      'TIP journals both MFE(R) and MAE(R) whether the setup succeeds or fails — target/stop end the game; MFE/MAE score the path.',
    scenarios: [
      {
        id: 'success',
        title: 'Success path (target hit, no retest)',
        narrative:
          'Think of a virtual long trade. At detect, TIP freezes the rails. Each later closed bar first updates the path scoreboard (best high / worst low), then checks fail and success rules.',
        setup: [
          { label: 'Reference (prior 20-bar high)', value: '100' },
          { label: 'ATR at detect (R-unit)', value: '2' },
          { label: 'Detect O/H/L/C', value: '100.5 / 101.5 / 100.2 / 101' },
          { label: 'Entry (detect close)', value: '101' },
          { label: 'Stop (reference)', value: '100' },
          { label: 'Target (no retest)', value: '100 + 2×ATR = 104' },
        ],
        diagram: {
          type: 'candles',
          title: 'Breakout success — rails + path',
          caption:
            'Blue band = detect bar. Yellow dashed = reference/stop 100. Blue = entry 101. Green = target 104. Bar 3 high clears the target.',
          candles: [
            { o: 100.5, h: 101.5, l: 100.2, c: 101, label: 'B0 detect', emphasis: true },
            { o: 101.2, h: 102.0, l: 100.5, c: 101.8, label: 'B1' },
            { o: 101.5, h: 101.7, l: 100.1, c: 100.8, label: 'B2 dip' },
            { o: 101.2, h: 104.3, l: 101.5, c: 103.9, label: 'B3 win' },
          ],
          levels: [
            { price: 104, label: 'Target', kind: 'target' },
            { price: 101, label: 'Entry', kind: 'entry' },
            { price: 100, label: 'Stop/Ref', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: 'Bar 0 (detect)',
            ohlc: 'O 100.5 / H 101.5 / L 100.2 / C 101',
            note: 'close 101 > 100 → Detected. Freeze entry 101, stop 100, target 104. Start path: best high 101.5, worst low 100.2.',
          },
          {
            label: 'Bar 1',
            ohlc: 'H 102.0 / L 100.5 / C 101.8',
            note: 'Update scoreboard → best high 102, worst low still 100.2. Close not < 100; high not ≥ 104 → still open.',
          },
          {
            label: 'Bar 2 (dip)',
            ohlc: 'H 101.7 / L 100.1 / C 100.8',
            note: 'Worst low → 100.1 (more pain). Still close ≥ 100 → not failed. Still below target.',
          },
          {
            label: 'Bar 3 (target)',
            ohlc: 'H 104.3 / L 101.5 / C 103.9',
            note: 'Best high → 104.3. High ≥ 104 → Succeeded (price_target). Trade ends.',
          },
        ],
        scoreboards: [
          {
            label: 'After detect (bar 0)',
            rows: [
              { metric: 'Entry / Stop / Target', value: '101 / 100 / 104' },
              { metric: 'MFE (R)', value: '(101.5−101)/2 = 0.25 R' },
              { metric: 'MAE (R)', value: '(101−100.2)/2 = 0.40 R' },
              { metric: 'Stage', value: 'Detected (open)' },
            ],
          },
          {
            label: 'Final (bar 3 success)',
            rows: [
              { metric: 'Outcome', value: 'Succeeded' },
              { metric: 'MFE (R)', value: '(104.3−101)/2 = 1.65 R' },
              { metric: 'MAE (R)', value: '(101−100.1)/2 = 0.45 R' },
              { metric: 'Move (R) at end close', value: '(103.9−101)/2 = 1.45 R' },
            ],
          },
        ],
        steps: [
          'Detect only when a closed bar’s close is above the prior ceiling (signal bar not in that window).',
          'At detect: freeze entry, stop, first target, and ATR used as the R-unit.',
          'On every later bar: update best high / worst low first, then check fail (close < stop), then success (high ≥ target).',
          'MFE can exceed the target distance if price overshoots (here 104.3 vs target 104).',
          'Winners still have MAE — this success absorbed 0.45 R of adverse dip first.',
        ],
        rulesVsMeasurements: { ...LONG_TRADE_RULES_VS_MEASUREMENTS },
        result:
          'TIP marks Succeeded with MFE ≈ 1.65 R and MAE ≈ 0.45 R. Target decided the win; MFE/MAE describe how the path looked.',
      },
      {
        id: 'fail',
        title: 'Fail path (close back under reference)',
        narrative:
          'Same detect rails. Price goes a little in favor, then a closed bar finishes below the stop/reference → Failed. MFE is still recorded.',
        setup: [
          { label: 'Same freeze as success story', value: 'entry 101, stop 100, target 104, ATR 2' },
        ],
        diagram: {
          type: 'candles',
          title: 'Breakout fail — close back under stop',
          caption:
            'Same rails as success. Bar 1 makes a small favorable high (MFE). Bar 2 closes under 100 → Failed; MAE uses the low at 99.5.',
          candles: [
            { o: 100.5, h: 101.5, l: 100.2, c: 101, label: 'B0 detect', emphasis: true },
            { o: 101.0, h: 102.0, l: 100.4, c: 101.5, label: 'B1' },
            { o: 101.0, h: 101.0, l: 99.5, c: 99.7, label: 'B2 fail' },
          ],
          levels: [
            { price: 104, label: 'Target', kind: 'target' },
            { price: 101, label: 'Entry', kind: 'entry' },
            { price: 100, label: 'Stop/Ref', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: 'Bar 0 (detect)',
            ohlc: 'H 101.5 / L 100.2 / C 101',
            note: 'Detected; rails frozen.',
          },
          {
            label: 'Bar 1',
            ohlc: 'H 102.0 / L 100.4 / C 101.5',
            note: 'Best high 102 → some favorable room. Still open.',
          },
          {
            label: 'Bar 2 (fail)',
            ohlc: 'H 101.0 / L 99.5 / C 99.7',
            note: 'Update worst low to 99.5, then close 99.7 < 100 → Failed (invalidation).',
          },
        ],
        scoreboards: [
          {
            label: 'Final (failed)',
            rows: [
              { metric: 'Outcome', value: 'Failed' },
              { metric: 'MFE (R)', value: '(102−101)/2 = 0.50 R' },
              { metric: 'MAE (R)', value: '(101−99.5)/2 = 0.75 R' },
              { metric: 'Note', value: 'Went +0.5 R first, then failed' },
            ],
          },
        ],
        steps: [
          'Fail rule for breakout: closed bar close < reference/stop.',
          'Scoreboard still keeps the best high seen before failure (MFE).',
          'MAE often reaches beyond the stop if the low wicks further (99.5 vs stop 100).',
        ],
        rulesVsMeasurements: { ...LONG_TRADE_RULES_VS_MEASUREMENTS },
        result:
          'TIP marks Failed with both MFE and MAE filled in. Fail does not mean “only MAE matters.”',
      },
      {
        id: 'retest-target',
        title: 'Optional: retest can rewrite the target',
        narrative:
          'After confirm, if price dips into the retest band near the reference without closing below it, TIP may set a measured target from the retest floor.',
        setup: [
          { label: 'Reference', value: '100' },
          { label: 'ATR', value: '2' },
          { label: 'Retest band (0.25×ATR)', value: '100 + 0.5 = up to 100.5 zone' },
          { label: 'Example retest floor (low)', value: '99.5 (still close ≥ 100)' },
          { label: 'Risk', value: '100 − 99.5 = 0.5' },
          { label: 'New target (success_rr = 2)', value: '100 + 2×0.5 = 101' },
        ],
        diagram: {
          type: 'candles',
          title: 'Retest rewrites target 104 → 101',
          caption:
            'After detect, a retest dips to floor 99.5 while close stays ≥ 100. Measured target becomes ref + 2× risk = 101 (green). Old ATR target 104 is no longer the active success line.',
          candles: [
            { o: 100.5, h: 101.5, l: 100.2, c: 101, label: 'Detect', emphasis: true },
            { o: 101, h: 102, l: 100.8, c: 101.2, label: 'Hold' },
            { o: 101, h: 101.2, l: 99.5, c: 100.2, label: 'Retest' },
            { o: 100.5, h: 101.5, l: 100.3, c: 101.3, label: 'New tgt' },
          ],
          levels: [
            { price: 104, label: 'Old tgt', kind: 'other' },
            { price: 101, label: 'New tgt', kind: 'target' },
            { price: 100, label: 'Ref/Stop', kind: 'reference' },
            { price: 99.5, label: 'Retest fl', kind: 'stop' },
          ],
        },
        steps: [
          'Initial no-retest target was 104; after a valid retest with floor under reference, target becomes reference + 2× risk.',
          'MFE/MAE continue updating from highs/lows independently of that rewrite.',
          'Success still means price reaches whatever the current target is.',
        ],
        result:
          'Retest changes the success rule (target), not the definition of MFE/MAE.',
      },
    ],
  },
  tipParameters: [
    tipParam('breakout.lookback_candles', 'Bars in the prior high window (excludes signal bar)'),
    tipParam('breakout.volume_avg_period', 'Bars in prior volume average'),
    tipParam('breakout.confirmation_mode', 'volume | close | both | close_fallback'),
    tipParam('breakout.volume_multiplier', 'Detect volume must be ≥ this × prior SMA'),
    tipParam('breakout.retest_atr_mult', 'How close a dip to reference counts as retest'),
    tipParam('breakout.strengthen_atr_mult', 'Extension beyond reference for Strengthened'),
    tipParam('breakout.success_rr', 'Reward multiple vs risk after retest'),
    tipParam('breakout.success_atr_mult_without_retest', 'Target distance in ATR if no retest'),
    tipParam('breakout.detector_version', 'Journal / support version tag', { advanced: true }),
    tipParam('atr_period', 'ATR length used for bands and R-unit'),
  ],
  lifecycle: [
    'Detected: close above prior 20-high; reference frozen',
    'Confirmed: volume and/or later close still above reference (mode-dependent)',
    'Retested: dip near reference without closing below',
    'Strengthened: extension about 1×ATR beyond reference',
    'Succeeded: target reached on a closed bar',
    'Failed: close back below reference',
    'Expired: session/bar limits by timeframe',
  ],
  closedCandleOnly: true,
  indexVolumeNote:
    'On index symbols or when volume is unusable, confirmation falls back to close-only (CLOSE_FALLBACK).',
  relatedSlugs: [
    { kind: 'indicator', slug: 'donchian-20', label: 'Donchian (20)' },
    { kind: 'indicator', slug: 'atr-14', label: 'ATR (14)' },
    { kind: 'indicator', slug: 'volume-sma-20', label: 'Volume SMA (20)' },
    { kind: 'pattern', slug: 'breakdown', label: 'Breakdown' },
  ],
  patternTypeId: 'breakout',
  sourceDocs: ['docs/patterns/breakout.md'],
  sourceCode: ['backend/app/patterns/breakout.py'],
  lastReviewed: '2026-08-04',
  detectorVersionHint: 'breakout-v1',
}

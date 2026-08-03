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
    narrative: 'Prior ceiling is 100. Bar closes at 101 with solid volume; later retests 100.1 then runs.',
    inputs: [
      { label: 'Prior Donchian high', value: '100' },
      { label: 'Signal close / volume', value: '101 / 2.0× avg' },
      { label: 'ATR at detect', value: '2' },
    ],
    steps: [
      'close 101 > 100 → Detected, reference frozen at 100',
      'Volume 2× avg ≥ 1.5× → volume leg of confirmation OK',
      'Later bar closes 100.5 > 100 → Confirmed',
      'Low 100.1 within 0.25×ATR of 100, close still ≥ 100 → Retested',
      'Target path uses measured move from retest floor (or 2×ATR if no retest)',
    ],
    result:
      'TIP would mark Detected (and can progress Confirmed / Retested). A later close below 100 would Failed.',
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
  lastReviewed: '2026-08-03',
  detectorVersionHint: 'breakout-v1',
}

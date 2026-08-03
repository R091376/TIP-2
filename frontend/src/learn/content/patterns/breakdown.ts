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
    narrative: 'Prior floor 50. Bar closes 49 with strong volume.',
    inputs: [
      { label: 'Prior Donchian low', value: '50' },
      { label: 'Signal close', value: '49' },
      { label: 'ATR', value: '1.5' },
    ],
    steps: [
      'close 49 < 50 → Detected, reference 50',
      'Later close 49.2 still < 50 → close confirmation path',
      'Close back at 50.5 → Failed',
    ],
    result: 'TIP would mark Detected on the break under 50; a reclaim close above 50 fails the setup.',
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
  lastReviewed: '2026-08-03',
  detectorVersionHint: 'breakdown-v1',
}

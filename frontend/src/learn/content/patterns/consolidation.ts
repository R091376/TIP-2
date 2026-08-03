import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const consolidation: LearnTopic = {
  kind: 'pattern',
  slug: 'consolidation',
  title: 'Consolidation',
  shortDescription: 'A multi-bar tight range vs ATR — a volatility regime, not a buy/sell call at detect.',
  group: 'range',
  direction: 'regime',
  plottedOnChart: false,
  plainEnglish: [
    'Consolidation means the last several bars are squeezed into a small high–low range compared with ATR (normal move size).',
    'It is a regime signal: “price is coiling.” It is not a directional long trade signal at detect even if the stored direction field is a placeholder long.',
    'Useful context before expansion; TIP journals how the range resolves over time.',
  ],
  howWeCalculate: [
    'Look at the last window_candles closed bars (default 10).',
    'Range R = max high − min low in that window.',
    'If R ≤ range_atr_mult × ATR, the window is tight → Detected.',
    'Freeze range high/low and mid; track duration until expansion, tighten, success rules, or max duration.',
  ],
  formulaPlain:
    'Tight when (highest high − lowest low) over the last 10 bars is at most 1.5 × ATR.',
  formulaFormal:
    'R = max(high) − min(low) over last M bars\n' +
    'tight if R ≤ κ × ATR, M=10, κ=1.5',
  workedExample: {
    narrative: 'Ten bars with high 105 and low 103; ATR is 2.',
    inputs: [
      { label: 'Window high / low', value: '105 / 103' },
      { label: 'R', value: '2' },
      { label: 'ATR / κ', value: '2 / 1.5' },
    ],
    steps: [
      'Threshold = 1.5 × 2 = 3',
      'R = 2 ≤ 3 → window is tight',
      'Detected; mid = 104',
    ],
    result:
      'TIP would Detect consolidation. That does not mean “buy” — it means the range is compressed relative to volatility.',
  },
  tipParameters: [
    tipParam('consolidation.window_candles', 'Bars in the compression window'),
    tipParam('consolidation.range_atr_mult', 'Max range as multiple of ATR to count as tight'),
    tipParam('consolidation.max_duration_candles', 'How long a consolidation instance may live'),
    tipParam('consolidation.tighten_ratio', 'Further squeeze threshold vs prior range', {
      advanced: true,
    }),
    tipParam('consolidation.detector_version', 'Journal version tag', { advanced: true }),
    tipParam('atr_period', 'ATR length for the tightness test'),
  ],
  lifecycle: [
    'Detected: window range ≤ κ×ATR (regime, not directional entry)',
    'May tighten further if range shrinks (tighten_ratio)',
    'Resolves / expires by duration or expansion rules in the detector',
    'Closed-candle only throughout',
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'indicator', slug: 'atr-14', label: 'ATR (14)' },
    { kind: 'pattern', slug: 'inside_bar', label: 'Inside bar' },
    { kind: 'pattern', slug: 'breakout', label: 'Breakout' },
  ],
  patternTypeId: 'consolidation',
  sourceDocs: ['docs/patterns/consolidation.md'],
  sourceCode: ['backend/app/patterns/consolidation.py'],
  lastReviewed: '2026-08-03',
  detectorVersionHint: 'consolidation-v1',
}

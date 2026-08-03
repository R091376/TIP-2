import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const volumeBreakout: LearnTopic = {
  kind: 'pattern',
  slug: 'volume_breakout',
  title: 'Volume breakout',
  shortDescription: 'Unusually large volume plus a wide bar — even without a Donchian break.',
  group: 'range',
  direction: 'both',
  plottedOnChart: false,
  plainEnglish: [
    'Volume breakout looks for a climax bar: volume much larger than average and a bar range that is meaningful vs ATR.',
    'Unlike price breakout, it does not require breaking the 20-bar high or low. Direction follows the bar’s close vs open.',
    'It does not fire on index symbols where volume is unusable (skip, not close-fallback).',
  ],
  howWeCalculate: [
    'Compute prior volume SMA over 20 bars (signal excluded) and ATR(14).',
    'Volume OK if signal volume ≥ 2× prior SMA.',
    'Move OK if high−low ≥ 0.5×ATR.',
    'Both required → Detected; long if close ≥ open, else short.',
    'Then short lifecycle: confirm beyond signal extreme, target 1.5×ATR, or fail at signal high/low stop.',
  ],
  formulaPlain:
    'Detect when volume ≥ 2× prior average and bar range ≥ 0.5×ATR. Long if close ≥ open, else short.',
  formulaFormal:
    'volOk = volume_t ≥ 2.0 × prior_SMA20(volume)\n' +
    'moveOk = (high_t − low_t) ≥ 0.5 × ATR\n' +
    'direction = long if close ≥ open else short',
  workedExample: {
    narrative: 'Average volume 1M; signal volume 2.2M; range equals 0.6×ATR; green candle.',
    inputs: [
      { label: 'Prior vol SMA', value: '1,000,000' },
      { label: 'Signal volume', value: '2,200,000' },
      { label: 'Range / ATR', value: '0.6×ATR' },
    ],
    steps: [
      '2.2M ≥ 2.0×1M → volume OK',
      '0.6 ≥ 0.5 → move OK',
      'close ≥ open → long Detected',
    ],
    result: 'TIP would Detect a long volume_breakout. On an index symbol, it would not detect at all.',
  },
  tipParameters: [
    tipParam('volume_breakout.volume_avg_period', 'Prior volume SMA length'),
    tipParam('volume_breakout.volume_multiplier', 'Volume multiple required (default 2×)'),
    tipParam('volume_breakout.min_range_atr_mult', 'Min bar range vs ATR'),
    tipParam('volume_breakout.success_atr_mult', 'Target distance in ATR'),
    tipParam('volume_breakout.max_candles_after_detect', 'Max bars to live after detect'),
    tipParam('volume_breakout.detector_version', 'Journal version tag', { advanced: true }),
    tipParam('atr_period', 'ATR length'),
  ],
  lifecycle: [
    'Detected: volume surge + wide bar (not necessarily Donchian break)',
    'Confirmed: later close beyond signal high (long) or low (short)',
    'Succeeded: ~1.5×ATR from entry',
    'Failed: close through signal stop (low for long / high for short)',
  ],
  closedCandleOnly: true,
  indexVolumeNote:
    'Does not fire on index symbols (volume unusable → no detect). This is not CLOSE_FALLBACK.',
  relatedSlugs: [
    { kind: 'indicator', slug: 'volume-sma-20', label: 'Volume SMA (20)' },
    { kind: 'pattern', slug: 'breakout', label: 'Breakout' },
    { kind: 'indicator', slug: 'atr-14', label: 'ATR (14)' },
  ],
  patternTypeId: 'volume_breakout',
  sourceDocs: ['docs/patterns/volume-breakout.md'],
  sourceCode: ['backend/app/patterns/volume_breakout.py'],
  lastReviewed: '2026-08-03',
  detectorVersionHint: 'volume-breakout-v1',
}

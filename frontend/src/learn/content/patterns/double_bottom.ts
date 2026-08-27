import { classicalPatternTopic } from './classicalShared'
import { DOUBLE_BOTTOM_SOURCES } from './classicalSources'

export const doubleBottom = classicalPatternTopic({
  slug: 'double_bottom',
  title: 'Double bottom',
  direction: 'long',
  shortDescription: 'Two similar troughs; long when a closed bar breaks the intervening peak.',
  bucket: 'double',
  detectorVersionHint: 'double-v1',
  sourceDocs: ['docs/patterns/double-bottom.md'],
  sourceCode: ['backend/app/patterns/double.py', 'backend/app/patterns/geometry.py'],
  externalSources: DOUBLE_BOTTOM_SOURCES,
  relatedSlug: { slug: 'double_top', label: 'Double top' },
  formulaPlain:
    'Two confirmed swing lows within an ATR band, with a peak between them. Detected on the first close above that peak.',
  formulaFormal:
    '|L2−L1| band: −max_second_deeper_atr ≤ (L2−L1)/ATR ≤ trough_tolerance_atr\n' +
    'Detected when first close > peak after L2 is confirmed',
  plainEnglish: [
    'A double bottom is a W: price makes a low, bounces, retests a similar low, then closes above the bounce high.',
    'TIP only fires after every swing is a confirmed fractal (no repaint) and the break is a close, not a wick.',
    'Stop sits below the lower trough. Target is the height of the W projected up. A dip back through the peak does not fail the trade until the trough stop is hit — that occupies the one-open slot for this family.',
  ],
  howWeCalculate: [
    'Scan confirmed pivot lows/highs (same fractals as higher-high / lower-low).',
    'Pair the newest valid W whose first close above the peak is the current bar.',
    'Freeze entry (close), confirmation line (peak), stop (lower trough − buffer), measured target.',
  ],
  lifecycle: [
    'Detected: first close above the peak after the second trough is confirmed',
    'Confirmed: later close still above the peak (default close mode)',
    'Retested: dip into the peak + 0.25×ATR without closing back below — target unchanged',
    'Strengthened: 1×ATR extension through the peak',
    'Succeeded: high reaches measured target (not on the detect bar)',
    'Failed: close through the trough stop',
    'Expired: max bars after detect, or session close on 15m',
  ],
  success: {
    id: 'success',
    title: 'W breaks the peak and reaches the measured move',
    narrative: 'Troughs 100 / 100.4, peak 108, ATR 2. Close 108.3 detects long; target 116.',
    setup: [
      { label: 'Trough 1', value: '100' },
      { label: 'Peak', value: '108' },
      { label: 'Trough 2', value: '100.4' },
      { label: 'ATR', value: '2' },
      { label: 'Break close', value: '108.3' },
      { label: 'Stop', value: '99.70' },
      { label: 'Target', value: '116' },
    ],
    diagram: {
      type: 'candles',
      title: 'Double bottom — close through the peak',
      caption: 'L1 100, peak 108, L2 100.4, break close 108.3. Stop below L1, target 116.',
      candles: [
        { o: 101, h: 102, l: 100, c: 101, label: 'L1' },
        { o: 104, h: 108, l: 103, c: 106, label: 'Peak', emphasis: true },
        { o: 103, h: 104, l: 100.4, c: 102, label: 'L2' },
        { o: 106, h: 107, l: 105, c: 106.5, label: '…' },
        { o: 107, h: 109, l: 106.5, c: 108.3, label: 'Break' },
        { o: 110, h: 116.5, l: 109, c: 116, label: 'Win' },
      ],
      levels: [
        { price: 116, label: 'Target', kind: 'target' },
        { price: 108.3, label: 'Entry', kind: 'entry' },
        { price: 108, label: 'Peak', kind: 'reference' },
        { price: 99.7, label: 'Stop', kind: 'stop' },
      ],
    },
    steps: [
      'Both troughs confirmed as fractals; |Δ| = 0.2 ATR inside the equality band.',
      'First close above 108 is 108.3 → Detected. Rails freeze.',
      'Later high 116.5 ≥ 116 → Succeeded.',
    ],
    result: 'Succeeded double_bottom at the measured move.',
  },
  fail: {
    id: 'fail',
    title: 'Break then close through the trough stop',
    narrative: 'Same W detects; a later close below 99.70 fails. A close back under 108 that stays above the stop does not fail — it occupies the slot.',
    setup: [
      { label: 'Entry', value: '108.3' },
      { label: 'Peak / ref', value: '108' },
      { label: 'Stop', value: '99.70' },
    ],
    diagram: {
      type: 'candles',
      title: 'Double bottom — stop hit',
      candles: [
        { o: 107, h: 109, l: 106.5, c: 108.3, label: 'Break' },
        { o: 107, h: 107.5, l: 99.2, c: 99.5, label: 'Fail', emphasis: true },
      ],
      levels: [
        { price: 108, label: 'Peak', kind: 'reference' },
        { price: 99.7, label: 'Stop', kind: 'stop' },
      ],
    },
    steps: [
      'Detected as above.',
      'Close 99.5 < 99.70 → Failed (invalidation). Fail wins if the same bar also tags the target.',
    ],
    result: 'Failed double_bottom; family slot frees for a new W.',
  },
})

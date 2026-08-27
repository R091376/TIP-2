import { classicalPatternTopic } from './classicalShared'
import { DOUBLE_TOP_SOURCES } from './classicalSources'

export const doubleTop = classicalPatternTopic({
  slug: 'double_top',
  title: 'Double top',
  direction: 'short',
  shortDescription: 'Two similar peaks; short when a closed bar breaks the intervening trough.',
  bucket: 'double',
  detectorVersionHint: 'double-v1',
  sourceDocs: ['docs/patterns/double-top.md'],
  sourceCode: ['backend/app/patterns/double.py', 'backend/app/patterns/geometry.py'],
  externalSources: DOUBLE_TOP_SOURCES,
  relatedSlug: { slug: 'double_bottom', label: 'Double bottom' },
  formulaPlain:
    'Two confirmed swing highs within an ATR band, with a trough between them. Detected on the first close below that trough.',
  formulaFormal:
    'Same engine as double bottom with signed candles (sign=−1).\nDetected when first close < trough after H2 is confirmed.',
  plainEnglish: [
    'A double top is an M: two similar highs around a dip, then a close below the dip.',
    'TIP shares the double-bottom engine: prices are negated so the W scanner runs unchanged.',
    'Stop is above the higher peak. Target is the M height projected down.',
  ],
  howWeCalculate: [
    'Invert candles, run the W pairing, emit unsigned rails as a short.',
    'One open double_bottom or double_top per symbol×timeframe.',
  ],
  lifecycle: [
    'Detected: first close below the trough',
    'Confirmed: later close still below the trough',
    'Retested: bounce into the trough − 0.25×ATR without closing back above',
    'Succeeded: low reaches the measured target',
    'Failed: close through the peak stop',
  ],
  success: {
    id: 'success',
    title: 'M breaks the trough and reaches the measured move',
    narrative: 'Peaks 108 / 108.4, trough 100, close 99.7 detects short.',
    setup: [
      { label: 'Peak 1', value: '108' },
      { label: 'Trough', value: '100' },
      { label: 'Peak 2', value: '108.4' },
      { label: 'Break close', value: '99.7' },
    ],
    diagram: {
      type: 'candles',
      title: 'Double top — close through the trough',
      candles: [
        { o: 107, h: 108, l: 106, c: 107, label: 'H1' },
        { o: 104, h: 105, l: 100, c: 102, label: 'Trough', emphasis: true },
        { o: 106, h: 108.4, l: 105, c: 107, label: 'H2' },
        { o: 102, h: 103, l: 99.2, c: 99.7, label: 'Break' },
        { o: 98, h: 99, l: 91.5, c: 92, label: 'Win' },
      ],
      levels: [
        { price: 108.4, label: 'Stop', kind: 'stop' },
        { price: 100, label: 'Trough', kind: 'reference' },
        { price: 99.7, label: 'Entry', kind: 'entry' },
        { price: 92, label: 'Target', kind: 'target' },
      ],
    },
    steps: [
      'H2 confirmed; first close below 100 is 99.7 → Detected short.',
      'Low reaches the projected height below the trough → Succeeded.',
    ],
    result: 'Succeeded double_top at the measured move.',
  },
  fail: {
    id: 'fail',
    title: 'Break then reclaim through the peak stop',
    narrative: 'Detect short, later close above the higher peak fails.',
    setup: [
      { label: 'Entry', value: '99.7' },
      { label: 'Stop', value: 'above higher peak' },
    ],
    diagram: {
      type: 'candles',
      title: 'Double top — stop hit',
      candles: [
        { o: 102, h: 103, l: 99.2, c: 99.7, label: 'Break' },
        { o: 101, h: 109.2, l: 100, c: 108.8, label: 'Fail', emphasis: true },
      ],
      levels: [
        { price: 108.4, label: 'Stop', kind: 'stop' },
        { price: 100, label: 'Trough', kind: 'reference' },
      ],
    },
    steps: ['Close above the structural stop → Failed.'],
    result: 'Failed double_top.',
  },
})

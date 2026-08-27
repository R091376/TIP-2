import { classicalPatternTopic } from './classicalShared'
import { INVERSE_HEAD_SHOULDERS_SOURCES } from './classicalSources'

export const inverseHeadShoulders = classicalPatternTopic({
  slug: 'inverse_head_shoulders',
  title: 'Inverse head and shoulders',
  direction: 'long',
  shortDescription: 'Inverted H&S; long on a close through the neckline joining the two armpit highs.',
  bucket: 'head_shoulders',
  detectorVersionHint: 'hs-v1',
  sourceDocs: ['docs/patterns/inverse-head-shoulders.md'],
  sourceCode: ['backend/app/patterns/head_shoulders.py', 'backend/app/patterns/geometry.py'],
  externalSources: INVERSE_HEAD_SHOULDERS_SOURCES,
  relatedSlug: { slug: 'head_shoulders', label: 'Head and shoulders' },
  formulaPlain:
    'Five confirmed swings with the head as the lowest low. Detected on the first close above the neckline.',
  formulaFormal:
    'sign=−1 on the H&S engine.\nProminence = min(LS,RS) − H.\nStop = RS low − buffer. Target = neckline_at_break + height.',
  plainEnglish: [
    'Inverse head and shoulders is the bullish twin: two shoulders around a lower head, then a close above the neckline.',
    'Same geometry engine as regular H&S via signed candles. A 3-trough inverse can also qualify as a double bottom — both may fire.',
  ],
  howWeCalculate: [
    'Run the H&S scanner on negated candles; convert rails back to market prices.',
    'Worked numbers (ATR 2): LS 100, A 106, H 94, B 105.5, RS 100.4. Neck at bar 36 ≈ 105.083. Close 105.50 detects. Stop 100.10. Target 116.833.',
  ],
  lifecycle: [
    'Detected: first close above the interpolated neckline',
    'Succeeded: high reaches measured target',
    'Failed: close below the right-shoulder low stop',
  ],
  success: {
    id: 'success',
    title: 'Inverse neckline break',
    narrative: 'LS 100, head 94, RS 100.4. Close 105.50 through n_36=105.083 detects long.',
    setup: [
      { label: 'LS / Head / RS', value: '100 / 94 / 100.4' },
      { label: 'Armpits', value: '106 / 105.5' },
      { label: 'n_36', value: '105.083' },
      { label: 'Entry', value: '105.50' },
      { label: 'Stop', value: '100.10' },
      { label: 'Target', value: '116.833' },
    ],
    diagram: {
      type: 'candles',
      title: 'Inverse H&S — close through the neckline',
      candles: [
        { o: 101, h: 102, l: 100, c: 101, label: 'LS' },
        { o: 104, h: 106, l: 103, c: 105, label: 'A' },
        { o: 97, h: 98, l: 94, c: 96, label: 'Head', emphasis: true },
        { o: 104, h: 105.5, l: 103, c: 105, label: 'B' },
        { o: 101, h: 102, l: 100.4, c: 101, label: 'RS' },
        { o: 104, h: 106, l: 104, c: 105.5, label: 'Break' },
      ],
      levels: [
        { price: 116.8, label: 'Target', kind: 'target' },
        { price: 105.5, label: 'Entry', kind: 'entry' },
        { price: 105.08, label: 'Neck', kind: 'reference' },
        { price: 100.1, label: 'Stop', kind: 'stop' },
      ],
    },
    steps: [
      'Prominence min(100,100.4)−94 = 6 = 3 ATR.',
      'First close above interpolated neckline detects long.',
      'Target is neckline-at-break + head-to-neckline height.',
    ],
    result: 'Succeeded inverse_head_shoulders at 116.833.',
  },
  fail: {
    id: 'fail',
    title: 'Close through the right-shoulder stop',
    narrative: 'Wick below the neckline with close still above it does not detect. After detect, fail is a close below 100.10.',
    setup: [
      { label: 'Stop', value: '100.10' },
      { label: 'Wick-only', value: 'no detect' },
    ],
    diagram: {
      type: 'candles',
      title: 'Inverse H&S — wick vs stop',
      candles: [
        { o: 105, h: 106, l: 103.5, c: 105.4, label: 'Wick' },
        { o: 104, h: 106, l: 104, c: 105.5, label: 'Break' },
        { o: 102, h: 103, l: 99.5, c: 99.9, label: 'Fail', emphasis: true },
      ],
      levels: [
        { price: 105.08, label: 'Neck', kind: 'reference' },
        { price: 100.1, label: 'Stop', kind: 'stop' },
      ],
    },
    steps: [
      'Wick through neckline, close ≤ neckline → no detect.',
      'After detect, close 99.9 < 100.10 → Failed.',
    ],
    result: 'Failed inverse H&S at the structural stop.',
  },
})

import { classicalPatternTopic } from './classicalShared'

export const headShoulders = classicalPatternTopic({
  slug: 'head_shoulders',
  title: 'Head and shoulders',
  direction: 'short',
  shortDescription: 'Shoulder–head–shoulder; short on a close through the (possibly sloped) neckline.',
  bucket: 'head_shoulders',
  detectorVersionHint: 'hs-v1',
  sourceDocs: ['docs/patterns/head-shoulders.md'],
  sourceCode: ['backend/app/patterns/head_shoulders.py', 'backend/app/patterns/geometry.py'],
  relatedSlug: { slug: 'inverse_head_shoulders', label: 'Inverse H&S' },
  formulaPlain:
    'Five confirmed swings: left shoulder, armpit, higher head, armpit, right shoulder. Detected on the first close below the neckline through the two armpits.',
  formulaFormal:
    'neck_i = A + (B−A)×(i−A.index)/(B.index−A.index)\nDetected when first close < neck_i after RS is confirmed.\nreference_level = neck at the break bar (frozen horizontal).',
  plainEnglish: [
    'Head and shoulders is a topping pattern: left shoulder, higher head, right shoulder, then a close through the neckline that joins the two armpits.',
    'TIP requires those five points to be confirmed fractals. A wick through the neckline does not count.',
    'After detect, lifecycle uses the frozen neckline price at the break — the slope is only for finding the break and drawing the overlay. Stop is beyond the right shoulder, not the head.',
  ],
  howWeCalculate: [
    'Walk confirmed pivot highs as LS / head / RS; armpits are the lowest confirmed pivot lows in each interval.',
    'Rank candidates by head-to-neckline height, then newest right shoulder.',
    'Freeze neckline-at-break into reference_level.',
  ],
  lifecycle: [
    'Detected: first close below the interpolated neckline',
    'Confirmed / retested / strengthened vs the frozen neckline',
    'Succeeded: low reaches measured move (head-to-neckline height)',
    'Failed: close above the right-shoulder stop',
  ],
  success: {
    id: 'success',
    title: 'Neckline break and measured move',
    narrative: 'LS 110, head 116, RS 109.5, armpits 104 / 103.5. Close through the sloped neckline detects short.',
    setup: [
      { label: 'LS / Head / RS', value: '110 / 116 / 109.5' },
      { label: 'Armpits', value: '104 / 103.5' },
      { label: 'Stop', value: 'beyond RS' },
    ],
    diagram: {
      type: 'candles',
      title: 'H&S — close through the neckline',
      candles: [
        { o: 108, h: 110, l: 107, c: 109, label: 'LS' },
        { o: 106, h: 107, l: 104, c: 105, label: 'A' },
        { o: 110, h: 116, l: 109, c: 113, label: 'Head', emphasis: true },
        { o: 106, h: 107, l: 103.5, c: 105, label: 'B' },
        { o: 108, h: 109.5, l: 107, c: 108, label: 'RS' },
        { o: 104, h: 105, l: 101.5, c: 102.8, label: 'Break' },
      ],
      levels: [
        { price: 109.5, label: 'RS/stop zone', kind: 'stop' },
        { price: 103.2, label: 'Neck @ break', kind: 'reference' },
        { price: 91, label: 'Target', kind: 'target' },
      ],
    },
    steps: [
      'RS confirmed; first close below interpolated neckline detects short.',
      'Measured height (head to neckline at the head) projected down is the target.',
    ],
    result: 'Succeeded head_shoulders at the measured move.',
  },
  fail: {
    id: 'fail',
    title: 'Neckline reclaim occupies the slot; stop is the right shoulder',
    narrative: 'A close back above the frozen neckline does not fail v1. Fail is a close above the right-shoulder stop.',
    setup: [
      { label: 'Invalidation', value: 'close > RS + buffer' },
      { label: 'Occupancy', value: 'close back above neckline, still below stop' },
    ],
    diagram: {
      type: 'candles',
      title: 'H&S occupancy vs stop',
      candles: [
        { o: 104, h: 105, l: 101.5, c: 102.8, label: 'Break' },
        { o: 104, h: 106, l: 103, c: 105, label: 'Reclaim' },
        { o: 108, h: 111, l: 107, c: 110.2, label: 'Stop', emphasis: true },
      ],
      levels: [
        { price: 109.7, label: 'RS stop', kind: 'stop' },
        { price: 103.2, label: 'Neck', kind: 'reference' },
      ],
    },
    steps: [
      'False break that reclaims the neckline keeps the instance open.',
      'No second H&S can detect on that symbol×TF until this one ends.',
    ],
    result: 'Failed only if the right-shoulder stop is closed through.',
  },
})

import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const volumeSma20: LearnTopic = {
  kind: 'indicator',
  slug: 'volume-sma-20',
  title: 'Volume SMA (20)',
  shortDescription: 'Average traded volume — the baseline for a “busy day” check.',
  group: 'indicator',
  plottedOnChart: true,
  plainEnglish: [
    'Volume SMA is a simple moving average of bar volume. It answers: “Is today’s volume large compared with recent bars?”',
    'On the chart, TIP draws a blue Volume SMA line on the volume pane (same period 20).',
    'Pattern detectors often use a prior average that excludes the signal bar, so the signal’s own volume does not inflate the baseline.',
  ],
  howWeCalculate: [
    'Collect volume from the last N closed bars.',
    'Average = sum of those volumes ÷ N.',
    'For breakout confirmation, prior SMA uses the N bars before the signal bar (signal excluded).',
    'On the chart, the FE helper maps the same period across available candles for the blue line.',
  ],
  formulaPlain:
    'Volume SMA = average of the last 20 bars’ volume. Prior SMA for a signal bar = average of the previous 20 bars only.',
  formulaFormal:
    'SMA_t = (V_{t−n+1} + … + V_t) / n\n' +
    'prior_SMA at signal t = (V_{t−n} + … + V_{t−1}) / n',
  workedExample: {
    narrative: 'Check whether a signal bar is “busy” versus a toy 5-bar prior average.',
    periodNote: 'Example uses N=5; TIP uses 20.',
    inputs: [
      { label: 'Prior volumes', value: '1000, 1200, 800, 1100, 900' },
      { label: 'Signal volume', value: '2000' },
      { label: 'Multiplier (breakout default)', value: '1.5×' },
    ],
    steps: [
      'prior SMA = 1000',
      'Threshold at 1.5× = 1500',
      '2000 ≥ 1500 → volume confirmation passes',
    ],
    result: 'Busy enough for breakout’s volume leg (toy window).',
    scenarios: [
      {
        id: 'busy-enough',
        title: 'Busy enough for breakout volume leg',
        narrative:
          'Breakout’s default confirmation wants detect-bar volume ≥ 1.5 × prior volume SMA. Volume breakout uses a stricter 2× by default.',
        periodNote: 'Example uses N=5; TIP uses 20.',
        setup: [
          { label: 'Prior volumes', value: '1000, 1200, 800, 1100, 900' },
          { label: 'Prior SMA', value: '1000' },
          { label: 'Signal volume', value: '2000' },
          { label: 'Breakout multiplier', value: '1.5× → threshold 1500' },
        ],
        diagram: {
          type: 'bars',
          title: 'Prior volumes + busy signal vs 1.5× SMA',
          caption:
            'Bars P1–P5 average to 1000 (dashed). Signal 2000 clears the 1.5× threshold at 1500 — volume leg OK for breakout.',
          bars: [
            { label: 'P1', value: 1000 },
            { label: 'P2', value: 1200 },
            { label: 'P3', value: 800 },
            { label: 'P4', value: 1100 },
            { label: 'P5', value: 900 },
            { label: 'Signal', value: 2000 },
          ],
          averageLine: { value: 1500, label: '1.5× SMA' },
        },
        timeline: [
          {
            label: 'Prior bars',
            note: 'Average volume = 1000 (signal excluded from the baseline).',
          },
          {
            label: 'Signal bar',
            note: 'Volume 2000 ≥ 1500 → volume_ok for breakout confirmation.',
          },
        ],
        steps: [
          'Always compare the signal to a baseline that does not include itself.',
          'On the chart, the blue line is the same period family so you can eye-check “busy vs quiet.”',
          'Volume breakout requires both high volume and a wide bar vs ATR — see that pattern page.',
        ],
        result: 'TIP would count this as volume-confirmed for breakout’s volume leg (with the toy window).',
      },
      {
        id: 'too-quiet',
        title: 'Too quiet (volume leg fails)',
        narrative: 'Same baseline, weaker signal volume — fails the 1.5× test.',
        setup: [
          { label: 'Prior SMA', value: '1000' },
          { label: 'Signal volume', value: '1200' },
          { label: 'Threshold 1.5×', value: '1500' },
        ],
        diagram: {
          type: 'bars',
          title: 'Signal volume under 1.5× threshold',
          caption:
            'Same baseline idea: 1.5× SMA = 1500 (dashed). Signal 1200 stays below — volume leg fails.',
          bars: [
            { label: 'P1', value: 1000 },
            { label: 'P2', value: 1200 },
            { label: 'P3', value: 800 },
            { label: 'P4', value: 1100 },
            { label: 'P5', value: 900 },
            { label: 'Signal', value: 1200 },
          ],
          averageLine: { value: 1500, label: '1.5× SMA' },
        },
        steps: [
          '1200 < 1500 → volume_ok is false.',
          'With confirmation_mode = both, breakout still needs the later close confirmation path and will not treat volume as OK.',
          'On index symbols with unusable volume, breakout falls back to close-only confirmation instead of inventing volume.',
        ],
        result: 'TIP would not mark the volume leg OK. Close-fallback on indices is a different rule — not a fake volume number.',
      },
    ],
  },
  tipParameters: [
    tipParam('indicators.volume_sma.period', 'Backend VolumeSmaIndicator.DEFAULT_PERIOD'),
    tipParam('VOLUME_SMA_PERIOD', 'Frontend chart constant (helpers.js) — must match backend'),
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'pattern', slug: 'breakout', label: 'Breakout' },
    { kind: 'pattern', slug: 'volume_breakout', label: 'Volume breakout' },
  ],
  sourceDocs: ['docs/indicators/volume-sma-20.md'],
  sourceCode: [
    'backend/app/indicators/volume_sma.py',
    'frontend/src/chart/helpers.js',
  ],
  lastReviewed: '2026-08-04',
}

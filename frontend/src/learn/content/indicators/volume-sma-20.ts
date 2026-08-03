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
      'prior SMA = (1000+1200+800+1100+900) / 5 = 1000',
      'Threshold at 1.5× = 1500',
      'Signal volume 2000 ≥ 1500 → volume confirmation would pass',
    ],
    result:
      'TIP would count this as busy enough for volume confirmation (with the toy window). On indices with zero volume, breakout falls back to close-only mode instead.',
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
  lastReviewed: '2026-08-03',
}

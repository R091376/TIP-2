import { REGIME_RULES_VS_MEASUREMENTS } from '../../exampleBlocks'
import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'
import { CONSOLIDATION_SOURCES } from '../learnSources'

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
    'If R ≤ range_atr_mult × ATR, the window is tight → Detected (and prior window was not already tight — avoids re-detect spam).',
    'Freeze range high/low and mid; track until expansion outside the box, or max duration.',
  ],
  formulaPlain:
    'Tight when (highest high − lowest low) over the last 10 bars is at most 1.5 × ATR.',
  formulaFormal:
    'R = max(high) − min(low) over last M bars\n' +
    'tight if R ≤ κ × ATR, M=10, κ=1.5',
  workedExample: {
    narrative:
      'Window high 105 / low 103, ATR 2 → R=2 ≤ 3 → detect regime. Expansion close outside box succeeds; max duration can fail.',
    inputs: [
      { label: 'Window high / low', value: '105 / 103' },
      { label: 'R / ATR / κ', value: '2 / 2 / 1.5' },
      { label: 'Threshold', value: '3' },
    ],
    steps: [
      'R=2 ≤ 3 → Detected',
      'Mid label = 104 (not a buy price recommendation)',
      'Close > 105 or < 103 later → expansion success',
    ],
    result: 'Regime detect only — not “go long at mid.”',
    scenarios: [
      {
        id: 'expand-success',
        title: 'Detect tight range → expand out (Succeeded)',
        narrative:
          'TIP labels a coil when the recent box is small vs ATR. Leaving the box on a closed bar resolves the regime as Succeeded (expansion), not “price target hit” in the breakout sense.',
        setup: [
          { label: 'Window (10 bars) high / low', value: '105 / 103' },
          { label: 'Range R', value: '2' },
          { label: 'ATR', value: '2' },
          { label: 'κ × ATR threshold', value: '1.5 × 2 = 3' },
          { label: 'Frozen box', value: 'low 103, high 105, mid 104' },
        ],
        diagram: {
          type: 'candles',
          title: 'Tight box 103–105 then expand up',
          caption:
            'Yellow levels = frozen range high/low. Mid 104 is a label only, not a buy. Last bar closes above 105 → expansion success.',
          candles: [
            { o: 103.5, h: 104.8, l: 103.1, c: 104.2, label: 'In box' },
            { o: 104, h: 104.9, l: 103.2, c: 103.8, label: 'In box' },
            { o: 103.8, h: 104.5, l: 103.2, c: 104, label: 'Detect', emphasis: true },
            { o: 104, h: 104.5, l: 103.2, c: 104, label: 'Still in' },
            { o: 104.2, h: 106.5, l: 104, c: 106, label: 'Expand' },
          ],
          levels: [
            { price: 105, label: 'Box high', kind: 'reference' },
            { price: 104, label: 'Mid', kind: 'other' },
            { price: 103, label: 'Box low', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: 'Detect bar',
            ohlc: 'inside 103–105',
            note: 'R=2 ≤ 3 and prior window was not already tight → Detected. Freeze box. Mid=104 is a label only.',
          },
          {
            label: 'Later bar (still in box)',
            ohlc: 'H 104.5 / L 103.2 / C 104',
            note: 'Still inside → remains open; path extremes update; duration ticks up.',
          },
          {
            label: 'Expansion bar',
            ohlc: 'H 106.5 / L 104 / C 106',
            note: 'close 106 > 105 → Succeeded with reason expand_up.',
          },
        ],
        scoreboards: [
          {
            label: 'At detect',
            rows: [
              { metric: 'Regime', value: 'Consolidation (tight)' },
              { metric: 'Box', value: '103 – 105' },
              { metric: 'Mid (label)', value: '104' },
            ],
          },
        ],
        steps: [
          'Tightness is range vs ATR, not a candle shape alone.',
          'Do not trade the mid as a breakout entry from this page alone.',
          'Expansion up or down both count as Succeeded resolution of the regime.',
        ],
        rulesVsMeasurements: { ...REGIME_RULES_VS_MEASUREMENTS },
        result: 'TIP marks Succeeded (expand_up). That means the coil resolved outward — not a directional “long target hit.”',
      },
      {
        id: 'timeout-fail',
        title: 'Still compressed too long (Failed max duration)',
        narrative:
          'If the box never expands before max_duration_candles, the instance can end as Failed with reason max_duration.',
        setup: [
          { label: 'Same box', value: '103 – 105' },
          { label: 'max_duration_candles', value: '30 (default)' },
        ],
        diagram: {
          type: 'candles',
          title: 'Still inside the box — timeout path',
          caption:
            'Every bar stays inside 103–105. If duration hits max without expansion → Failed (max_duration), not a directional stop-out.',
          candles: [
            { o: 103.8, h: 104.6, l: 103.2, c: 104.1, label: 't+1' },
            { o: 104, h: 104.8, l: 103.3, c: 103.9, label: 't+2' },
            { o: 103.9, h: 104.4, l: 103.1, c: 104.2, label: 't+3' },
            { o: 104.1, h: 104.7, l: 103.4, c: 103.8, label: '…' },
            { o: 103.7, h: 104.5, l: 103.2, c: 104.0, label: 'Still in' },
          ],
          levels: [
            { price: 105, label: 'Box high', kind: 'reference' },
            { price: 103, label: 'Box low', kind: 'stop' },
          ],
        },
        steps: [
          'Each new bar inside the box increases duration.',
          'If duration hits the max while still inside → Failed (timed out).',
          'That is different from a directional stop-out on a long trade.',
        ],
        rulesVsMeasurements: { ...REGIME_RULES_VS_MEASUREMENTS },
        result: 'TIP can mark Failed for timeout without ever “invalidating a long.” Read it as regime unresolved.',
      },
    ],
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
    'Succeeded: closed expand above range high or below range low',
    'Failed: max duration without expansion',
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
  externalSources: CONSOLIDATION_SOURCES,
  lastReviewed: '2026-08-04',
  detectorVersionHint: 'consolidation-v1',
}

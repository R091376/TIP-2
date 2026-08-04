import { LONG_TRADE_RULES_VS_MEASUREMENTS } from '../../exampleBlocks'
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
    narrative:
      'Prior vol SMA 1M, signal 2.2M, ATR 4, green bar range 3 → long detect. Target entry+1.5×ATR; stop at signal low.',
    inputs: [
      { label: 'Prior vol SMA', value: '1,000,000' },
      { label: 'Signal volume', value: '2,200,000' },
      { label: 'ATR', value: '4' },
      { label: 'Signal O/H/L/C', value: '100 / 103 / 100 / 102.5' },
    ],
    steps: [
      '2.2M ≥ 2×1M and range 3 ≥ 0.5×4 → Detect long',
      'Entry 102.5, stop 100, target 102.5+6 = 108.5',
    ],
    result: 'Long volume_breakout with short lifecycle; never fires on index symbols.',
    scenarios: [
      {
        id: 'success',
        title: 'Long success (volume + wide bar → target)',
        narrative:
          'No Donchian ceiling required. A busy, wide green bar starts a virtual long. Later bars update MFE/MAE; target is entry + 1.5×ATR.',
        setup: [
          { label: 'Prior volume SMA', value: '1,000,000' },
          { label: 'Signal volume', value: '2,200,000 (≥ 2×)' },
          { label: 'ATR', value: '4' },
          { label: 'Signal O/H/L/C', value: '100 / 103 / 100 / 102.5' },
          { label: 'Range vs 0.5×ATR', value: '3 ≥ 2 → move OK' },
          { label: 'Entry / stop / target', value: '102.5 / 100 / 108.5' },
        ],
        diagram: {
          type: 'candles',
          title: 'Volume breakout long — wide busy bar to target',
          caption:
            'Detect bar is wide and green. Stop at signal low 100, entry 102.5, target 108.5 (1.5×ATR). B2 high clears target.',
          candles: [
            { o: 100, h: 103, l: 100, c: 102.5, label: 'B0 detect', emphasis: true },
            { o: 102.5, h: 105, l: 101.5, c: 104, label: 'B1' },
            { o: 104, h: 109, l: 104, c: 108, label: 'B2 win' },
          ],
          levels: [
            { price: 108.5, label: 'Target', kind: 'target' },
            { price: 102.5, label: 'Entry', kind: 'entry' },
            { price: 100, label: 'Stop', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: 'Bar 0 (detect)',
            ohlc: 'O 100 / H 103 / L 100 / C 102.5',
            note: 'vol+range OK, close ≥ open → Detected long. Freeze rails. Path starts at high 103 / low 100.',
          },
          {
            label: 'Bar 1',
            ohlc: 'H 105 / L 101.5 / C 104',
            note: 'Best high 105. Not failed (close ≥ stop). Not at target yet. May confirm if close > signal high 103.',
          },
          {
            label: 'Bar 2 (target)',
            ohlc: 'H 109 / L 104 / C 108',
            note: 'High 109 ≥ 108.5 → Succeeded (on a bar after detect).',
          },
        ],
        scoreboards: [
          {
            label: 'Final',
            rows: [
              { metric: 'Outcome', value: 'Succeeded' },
              { metric: 'MFE (R)', value: '(109−102.5)/4 = 1.625 R' },
              { metric: 'MAE (R)', value: '(102.5−100)/4 = 0.625 R' },
            ],
          },
        ],
        steps: [
          'Both volume and range gates must pass on the same closed bar.',
          'Stop is the signal low for longs (signal high for shorts).',
          'Target is 1.5×ATR from entry in the trade direction.',
        ],
        rulesVsMeasurements: { ...LONG_TRADE_RULES_VS_MEASUREMENTS },
        result: 'Succeeded long volume_breakout; MFE/MAE both journaled.',
      },
      {
        id: 'fail-or-skip',
        title: 'Fail stop — or never detect on index',
        narrative:
          'Two different “no win” stories: (1) equity bar detects then fails through stop; (2) index symbol never detects.',
        setup: [
          { label: 'Same long rails', value: 'entry 102.5, stop 100, target 108.5' },
        ],
        diagram: {
          type: 'candles',
          title: 'Volume breakout fail through signal low',
          caption:
            'Equity path: after detect, close under stop 100 → Failed. (Index symbols never detect at all.)',
          candles: [
            { o: 100, h: 103, l: 100, c: 102.5, label: 'B0 detect', emphasis: true },
            { o: 102, h: 102, l: 99, c: 99.5, label: 'B1 fail' },
          ],
          levels: [
            { price: 108.5, label: 'Target', kind: 'target' },
            { price: 102.5, label: 'Entry', kind: 'entry' },
            { price: 100, label: 'Stop', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: 'Bar 0 (detect)',
            ohlc: 'H 103 / L 100 / C 102.5',
            note: 'Detected on a normal equity with usable volume.',
          },
          {
            label: 'Bar 1 (fail)',
            ohlc: 'H 102 / L 99 / C 99.5',
            note: 'close 99.5 < stop 100 → Failed. MAE uses worst low 99.',
          },
        ],
        steps: [
          'Fail: close through the signal-side stop.',
          'Index segment: detector returns no pattern at all (not close-fallback).',
          'Quiet volume or tiny range: also no detect.',
        ],
        rulesVsMeasurements: { ...LONG_TRADE_RULES_VS_MEASUREMENTS },
        result:
          'Equity path can Fail with MFE/MAE filled. Index path never opens a volume_breakout instance.',
      },
    ],
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
  lastReviewed: '2026-08-04',
  detectorVersionHint: 'volume-breakout-v1',
}

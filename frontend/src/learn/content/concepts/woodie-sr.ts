import { tipParam } from '../../tipParam'
import type { LearnTopic } from '../../types'

export const woodieSr: LearnTopic = {
  kind: 'concept',
  slug: 'woodie-sr',
  title: 'Woodie support & resistance',
  shortDescription:
    'Daily S/R ladder from yesterday’s range and today’s open — stamped on every pattern so Research can ask “at S2?” or “through R1?”.',
  group: 'context',
  direction: 'both',
  plottedOnChart: false,
  plainEnglish: [
    'Support is a price where buyers often show up. Resistance is a price where sellers often show up. TIP does not guess these by eye — it computes a Woodie pivot ladder once per symbol at the start of the cash session.',
    'Woodie is special because today’s official open (first 09:15 IST trade) has half the weight of the pivot. A gap-up lifts the whole ladder; a gap-down lowers it. Classic floor pivots ignore the open and would miss that.',
    'This is not a new pattern. When a hammer, breakout, or any other setup is accepted, TIP stamps “where was this detect vs today’s S3…R3?” Those stamps never change later, just like volume-ok-at-detect.',
    'You use the stamps on Pattern Stats → Research: filter hammers at S2, breakouts that closed through R1, or gap-down days that opened through S2.',
  ],
  questionsItSolves: [
    'How many successful hammers printed when we detected at S2 (bouncing off support)?',
    'Did this detect break down through S2 (support failed), or did it only sit near S2?',
    'Did a breakout also clear Woodie R1 on the signal bar?',
    'What happens on gap-up / gap-down days — did the stock open already through a named level?',
    'Is this long a confluence setup (long near support) or a break setup (long through resistance)?',
  ],
  howToUse: [
    'Open Pattern Stats as ADMIN and switch to Research. The Woodie S/R row has Nearest, Cross, Open through, and Gap.',
    '“At S2” (bounce / setup from support): Nearest = S2, turn on Near S/R and SR confluence. Example: hammers that fired next to S2.',
    '“Broke through S2” (support failed): Cross = s2 down. That means the detect candle traded at/above S2 and closed below it.',
    '“Cleared R1”: Cross = r1 up — the signal bar traded at/below R1 and closed above it.',
    '“Gapped through S2”: Open through = through S2 and Gap = down. The open itself was already below S2; that is not a signal-bar cross.',
    'Quality chips: Near S/R (within 0.5× the pattern’s ATR), SR confluence (long at S* or short at R*), SR break (long through R* or short through S*).',
    'Built-in presets: Hammer at S2, Breakout cleared R1, Gap through S2. Group by Nearest or Type · nearest to compare S2 vs R1 vs mid-range.',
    'Near uses the pattern timeframe ATR at detect, not daily ATR. A 5m hammer can be “near S2” while a 1d hammer at the same rupee distance is not.',
    'Cross / break filters skip older 5m (~60 days) and 15m (~90 days) backfill rows that have no signal candle. Historical open is that day’s 1d open except the last ~10 days when a 1m 09:15 bar was seeded.',
  ],
  howWeCalculate: [
    'Take the last completed daily candle as previous day: high, low, close (never today’s still-open 1d bar).',
    'Wait for the first Regular Trading Hours print at 09:15 IST (the 1-minute bar open). That price is today’s open. Do not use pre-open / IEP or the clock flipping to OPEN with zero trades.',
    'Compute Woodie PP = (prevHigh + prevLow + 2 × todayOpen) / 4, then S1–S3 and R1–R3 from that PP and yesterday’s range. R4/S4 are stored but not used as Research filters.',
    'On a large gap, named levels can invert (S1 can sit above S2). “Gapped through S2” is the numeric test todayOpen < S2 — never a named-order bin.',
    'After a pattern passes the min-risk gate, stamp nearest named level, ATR distance, near?, signal-bar cross, confluence/break, gap direction, and open-through tokens. Missing daily history → leave the stamp empty (NULL), not “not near”.',
    'Levels persist for the IST session. A mid-day restart reuses the same 09:15 open + same previous daily bar.',
  ],
  formulaPlain:
    'Pivot is a four-part average that double-counts today’s open. Supports and resistances are mirrors of yesterday’s high/low around that pivot. Distance to a level is measured in the pattern’s ATR at detect (default “near” = 0.5 ATR).',
  formulaFormal:
    'range = prevHigh − prevLow\n' +
    'PP  = (prevHigh + prevLow + 2 × todayOpen) / 4\n' +
    'R1  = 2×PP − prevLow          S1 = 2×PP − prevHigh\n' +
    'R2  = PP + range              S2 = PP − range\n' +
    'R3  = prevHigh + 2×(PP − prevLow)\n' +
    'S3  = prevLow  − 2×(prevHigh − PP)\n' +
    'gap = todayOpen − prevClose\n' +
    'near ⇔ |entry − nearest| / atr_at_detect ≤ 0.5\n' +
    'cross_up(L)   = bar.low ≤ L and bar.close > L\n' +
    'cross_down(L) = bar.high ≥ L and bar.close < L\n' +
    'open through S2 ⇔ todayOpen < S2',
  workedExample: {
    narrative:
      'Same previous day (H=12, L=10, C=11) under three opens: flat, large gap-down, then a hammer sitting on S2. Production uses these identities (`woodie_open_v1`).',
    periodNote: 'Daily Woodie ladder; “near” uses the detecting timeframe’s ATR, not daily ATR.',
    inputs: [
      { label: 'Previous day H / L / C', value: '12 / 10 / 11' },
      { label: 'Range', value: '2' },
      { label: 'Flat open', value: '11 → PP = 11, S2 = 9, R1 = 12' },
      { label: 'Gap-down open', value: '6 → PP = 8.5, S2 = 6.5, S1 = 5' },
    ],
    steps: [
      'range = 12 − 10 = 2',
      'With open 11: PP = (12 + 10 + 22) / 4 = 11; R1 = 12; S1 = 10; R2 = 13; S2 = 9; R3 = 14; S3 = 8',
      'With open 6: PP = 8.5; S2 = 6.5; S1 = 5. Open 6 is below S2 but above S1 — gapped through S2, not through S1.',
      'A 5m hammer at 6.2 with ATR = 1 is 0.3 ATR from S2 → near + long confluence.',
    ],
    result:
      'Flat open gives a neat S3…R3 stack. A large gap-down inverts some names — Research still uses prices, so “through S2” stays honest.',
    scenarios: [
      {
        id: 'compute-flat',
        title: 'Compute the ladder (open = yesterday’s close)',
        narrative:
          'No gap. Woodie PP lands on 11, the same as a simple average of H, L, and C. The named levels line up in price order.',
        setup: [
          { label: 'Prev H / L / C', value: '12 / 10 / 11' },
          { label: 'Today open', value: '11 (gap = 0, flat)' },
          { label: 'PP', value: '11' },
          { label: 'S3 … R3', value: '8, 9, 10, 11, 12, 13, 14' },
        ],
        diagram: {
          type: 'candles',
          title: 'Yesterday’s range and today’s open on the Woodie ladder',
          caption:
            'Previous day 10–12, close 11. Today opens at 11. Horizontal lines are S2, S1, PP, R1. This is the flat-open golden fixture.',
          candles: [
            { o: 10.5, h: 12, l: 10, c: 11, label: 'Prev day' },
            { o: 11, h: 11.4, l: 10.8, c: 11.2, label: 'Today', emphasis: true },
          ],
          levels: [
            { price: 13, label: 'R2 13', kind: 'other' },
            { price: 12, label: 'R1 12', kind: 'target' },
            { price: 11, label: 'PP 11', kind: 'entry' },
            { price: 10, label: 'S1 10', kind: 'stop' },
            { price: 9, label: 'S2 9', kind: 'reference' },
          ],
        },
        steps: [
          'Freeze yesterday’s completed 1d OHLC — not today’s forming daily bar.',
          'Wait for the first 09:15 print; that open is the only new input.',
          'PP double-counts the open so a later gap would have moved the whole map.',
        ],
        result: 'With open = 11 the ladder is monotone: S3 < S2 < S1 < PP < R1 < R2 < R3.',
      },
      {
        id: 'gap-down-invert',
        title: 'Large gap-down — names invert, “through S2” is numeric',
        narrative:
          'Open 6 vs previous close 11 is a 5-point gap-down. Woodie PP drops to 8.5. S1 (5) is now below S2 (6.5). If we sorted levels by name we would wrongly say the open gapped through S1.',
        setup: [
          { label: 'Prev H / L / C', value: '12 / 10 / 11' },
          { label: 'Today open', value: '6 (gap = −5)' },
          { label: 'PP / S2 / S1 / S3', value: '8.5 / 6.5 / 5 / 3' },
          { label: 'Open vs S2', value: '6 < 6.5 → through S2' },
          { label: 'Open vs S1', value: '6 > 5 → not through S1' },
        ],
        diagram: {
          type: 'candles',
          title: 'Gap-down open sits between S1 and S2',
          caption:
            'Open 6 is below S2 (6.5) and above S1 (5). Research token is s2_down, not s1_down. Named-order bins would lie here.',
          candles: [
            { o: 10.5, h: 12, l: 10, c: 11, label: 'Prev day' },
            { o: 6, h: 6.8, l: 5.6, c: 6.3, label: 'Gap down', emphasis: true },
          ],
          levels: [
            { price: 8.5, label: 'PP 8.5', kind: 'entry' },
            { price: 6.5, label: 'S2 6.5', kind: 'reference' },
            { price: 6, label: 'Open 6', kind: 'other' },
            { price: 5, label: 'S1 5', kind: 'stop' },
          ],
        },
        timeline: [
          {
            label: '09:15 open',
            close: '6',
            note: 'First RTH print. Ladder freezes. gap_dir = down.',
          },
          {
            label: 'Open-through tokens',
            note: 's2_down and pp_down. Not s3_down (6 ≮ 3) and not s1_down (6 ≮ 5).',
          },
        ],
        scoreboards: [
          {
            label: 'Stamp if a detect fires here',
            rows: [
              { metric: 'sr_gap_dir', value: 'down' },
              { metric: 'sr_open_through', value: 's2_down,pp_down' },
              { metric: 'sr_cross', value: 'none unless the signal bar actually trades a level' },
            ],
          },
        ],
        steps: [
          'Never assume S1 is below S2 after a large gap.',
          '“Gapped through S2” is today_open < S2.',
          'A gap without trading the level is not a signal-bar cross.',
        ],
        rulesVsMeasurements: {
          rules: [
            'Freeze on first 09:15 print, not on the OPEN clock.',
            'Open-through tokens are numeric compares at stamp time.',
          ],
          measurements: [
            'gap = todayOpen − prevClose',
            'tokens include s2_down iff todayOpen < S2',
          ],
        },
        result:
          'This is why TIP dropped named-order bins as Research filters — gap days are exactly when those bins invert.',
      },
      {
        id: 'research-hammer-s2',
        title: 'How to read a hammer at S2 in Research',
        narrative:
          'Later a 5m hammer detects at 6.2 with ATR = 1. Nearest named level is S2 (6.5). Distance = 0.3 ATR → near. Long + S* + near → confluence. The bar did not close through S2, so this is “from S2”, not “broke S2”.',
        setup: [
          { label: 'Ladder', value: 'same gap-down day (S2 = 6.5)' },
          { label: 'Detect close / ATR', value: '6.2 / 1.0' },
          { label: 'Direction', value: 'long (hammer)' },
          { label: 'Research stack', value: 'patternType=hammer, srNearest=s2, srNear, srConfluence' },
        ],
        diagram: {
          type: 'candles',
          title: 'Hammer sitting just under S2',
          caption:
            'Long lower wick into 5.7, close 6.2. S2 at 6.5 is 0.3 ATR away. Confluence, no cross. Contrast with a close below S2, which would stamp s2_down.',
          candles: [
            { o: 6.4, h: 6.5, l: 6.2, c: 6.3, label: 'Prior' },
            { o: 6.25, h: 6.35, l: 5.7, c: 6.2, label: 'Hammer', emphasis: true },
          ],
          levels: [
            { price: 6.5, label: 'S2 6.5', kind: 'reference' },
            { price: 6.2, label: 'Entry 6.2', kind: 'entry' },
          ],
        },
        steps: [
          'Nearest = argmin |entry − {S3,S2,S1,PP,R1,R2,R3}| (ties prefer PP, then direction).',
          'Near if distance ≤ 0.5 ATR (TIP_PATTERN_SR_NEAR_ATR).',
          'Confluence: long at S3/S2/S1 or short at R1/R2/R3, and near.',
          'Break: long with r1_up/r2_up/r3_up, or short with s3_down/s2_down/s1_down.',
          'Load the “Hammer at S2” Research preset to run this slice on the journal.',
        ],
        rulesVsMeasurements: {
          rules: [
            'Do not mix “at S2” (nearest) with “through S2” (cross).',
            'Dashboard stats table is not sliced by S/R — use Research.',
          ],
          measurements: [
            'distance_atr = |6.2 − 6.5| / 1 = 0.3',
            'sr_near = true; sr_confluence = true; sr_cross = none',
          ],
        },
        result:
          'Research can now answer “did hammers at support outperform raw hammers?” without changing the pattern detector.',
      },
    ],
  },
  tipParameters: [
    tipParam('pattern_sr_enabled', 'Master switch: freeze daily levels and allow stamps'),
    tipParam('pattern_sr_stamp_enabled', 'Stamp accepted detects (requires master on)'),
    tipParam('pattern_sr_research_enabled', 'Allow Woodie filters on Research /query'),
    tipParam(
      'pattern_sr_backfill_on_startup',
      'After bootstrap, fill ~180d daily rows + unstamped instances',
    ),
    tipParam('pattern_sr_near_atr', '“Near” threshold in the detecting timeframe’s ATR'),
    tipParam('pattern_sr_method', 'Ladder formula version (woodie_open_v1)'),
  ],
  lifecycle: [
    'PRE_OPEN: no freeze (no official RTH open yet).',
    'First 09:15 1m print: persist daily_sr_levels for the IST session.',
    'Each accepted detect (after min-risk): stamp sr_* on the instance; never update later.',
    'Research reads those frozen fields. Dashboard pattern_statistics is unchanged.',
    'Startup / symbol add: seed 1d then 1m, then recover today’s row from the 09:15 open.',
  ],
  closedCandleOnly: true,
  relatedSlugs: [
    { kind: 'indicator', slug: 'atr-14', label: 'ATR (14)' },
    { kind: 'pattern', slug: 'hammer', label: 'Hammer' },
    { kind: 'pattern', slug: 'breakout', label: 'Breakout' },
    { kind: 'pattern', slug: 'breakdown', label: 'Breakdown' },
    { kind: 'pattern', slug: 'shooting_star', label: 'Shooting star' },
  ],
  sourceDocs: ['docs/design-woodie-sr.md'],
  sourceCode: [
    'backend/app/sr/woodie.py',
    'backend/app/sr/stamp.py',
    'backend/app/sr/service.py',
    'backend/app/patterns/evaluator.py',
  ],
  lastReviewed: '2026-08-18',
  detectorVersionHint: 'woodie_open_v1',
}

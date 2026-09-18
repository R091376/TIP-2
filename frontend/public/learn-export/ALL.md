# TIP Learn — complete export

Generated from the TIP frontend Learn catalog (19 topics).

Use this file when pasting into an AI chat that cannot browse multiple URLs.

---

# ATR (14)

> **Kind:** indicator · **Slug:** `atr-14` · **Group:** indicator
>
> SPA: /learn/indicators/atr-14  
> Markdown: /learn-export/indicators/atr-14.md

How big is a normal candle move? TIP’s volatility yardstick.

---

## Plain English

- ATR means Average True Range. It answers: “How large is a typical move for this symbol on this timeframe?”
- TIP plots Wilder ATR(14) in its own pane under price (amber line), computed on the chart from the same candles. Pattern detectors use the same formula for retest bands, targets, and the R-unit.
- True range also counts gaps: a bar that opens far from yesterday’s close still counts as a big move.

## How TIP calculates it

- For each closed bar, compute true range (TR): the largest of (high−low), |high−prior close|, |low−prior close|.
- After enough bars, take the simple average of the first 14 true ranges — that is the first ATR.
- For each new bar, smooth with Wilder’s method: blend the previous ATR with the new TR.
- If fewer than 15 closed bars (14 TR values need a prior close), ATR is unavailable and patterns that need it will not open.

## Formula (plain)

First ATR is the average of 14 true ranges. Later ATR values = (previous ATR × 13 + new true range) ÷ 14.

## Formula (formal)

```
TR_i = max(high_i − low_i, |high_i − close_{i−1}|, |low_i − close_{i−1}|)
ATR_first = mean(TR_1 … TR_14)
ATR_t = (ATR_{t−1} × 13 + TR_t) / 14
```

## Worked example

Toy series with period 3 so you can see the steps. TIP production uses period 14 with the same method. Patterns freeze ATR at detect as the R-unit.

*Example uses N=3; TIP uses 14.*

**Inputs**

| | |
| --- | --- |
| Bar 1 close | 100 |
| Bar 2 H/L/C | 105 / 99 / 103 |
| Bar 3 H/L/C | 104 / 100 / 101 |
| Bar 4 H/L/C | 108 / 102 / 107 |

**Steps**

- TR2 = max(105−99, |105−100|, |99−100|) = 6
- TR3 = max(104−100, |104−103|, |100−103|) = 4
- TR4 = max(108−102, |108−101|, |102−101|) = 7
- First ATR (N=3) = (6+4+7)/3 = 5.67

**Result:** TIP would report ATR ≈ 5.67 after the first full toy window. With N=14 it waits for more bars, then uses Wilder smoothing the same way.

## Scenarios

### Compute ATR (toy N=3)

ATR is not a buy/sell signal. It is a size ruler. We use a tiny period so the arithmetic is obvious.

**Setup**

| | |
| --- | --- |
| Prior close (bar 1) | 100 |
| Bar 2 H/L/C | 105 / 99 / 103 |
| Bar 3 H/L/C | 104 / 100 / 101 |
| Bar 4 H/L/C | 108 / 102 / 107 |

**Timeline**

- Bar 2 · OHLC H 105 / L 99 / C 103 · — TR = max(6, 5, 1) = 6 (includes gap vs prior close 100).
- Bar 3 · OHLC H 104 / L 100 / C 101 · — TR = max(4, 1, 3) = 4.
- Bar 4 · OHLC H 108 / L 102 / C 107 · — TR = max(6, 7, 1) = 7. First ATR = mean(6,4,7) = 5.67.

**After first ATR**

| Metric | Value |
| --- | --- |
| ATR | ≈ 5.67 |
| If next TR = 3 | ATR = (5.67×2 + 3)/3 ≈ 4.78 |

**Steps**

- True range takes the largest of bar height and gap distances to prior close.
- First ATR averages the first N true ranges.
- Later bars use Wilder smoothing so ATR changes gradually.

**Result:** With enough bars, TIP always has an ATR number patterns can freeze at detect.

### How patterns use ATR

When Breakout detects, it freezes atr_at_detect. That single number drives retest distance, strengthen distance, the frozen target, and R for MFE/MAE.

**Setup**

| | |
| --- | --- |
| Example frozen ATR | 2 |
| Breakout reference | 100 |
| Target | 100 + 2×2 = 104 |
| Retest band (0.25×ATR) | within 0.5 of reference |
| If entry 101 and best high 104.3 | MFE(R) = (104.3−101)/2 = 1.65 R |

**Steps**

- ATR answers “how big is normal?” so a ₹2 stock and a ₹2000 stock can share the same R language.
- Patterns that need ATR will not open while ATR is still warming up.
- Open the Breakout Learn page for a full trade timeline using ATR = 2.

**Result:** ATR itself does not detect breakouts — breakout/breakdown/pinbars/etc. consume ATR as a yardstick.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| period | 14 | `indicators.atr.period` | Default Wilder period (AtrIndicator.DEFAULT_PERIOD) |
| atr_period | 14 | `atr_period` | Settings field used by pattern detectors for ATR length |

## Flags

- Plotted on chart: yes
- Closed candle only: yes

## Related

- [Donchian (20)](./donchian-20.md) (`indicator/donchian-20`)
- [Breakout](./../patterns/breakout.md) (`pattern/breakout`)
- [Breakdown](./../patterns/breakdown.md) (`pattern/breakdown`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Average True Range (ATR)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/average-true-range-atr) — Wilder 1978; TR = max(H−L, |H−prior C|, |L−prior C|); default period 14; Wilder smoothing
- [Investopedia — Average True Range (ATR)](https://www.investopedia.com/terms/a/atr.asp)

**Docs**

- `docs/indicators/atr-14.md`

**Code**

- `backend/app/indicators/atr.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Donchian (20)

> **Kind:** indicator · **Slug:** `donchian-20` · **Group:** indicator
>
> SPA: /learn/indicators/donchian-20  
> Markdown: /learn-export/indicators/donchian-20.md

Highest high and lowest low over a lookback — the breakout ceiling/floor.

---

## Plain English

- Donchian channels track the highest high and lowest low over the last N bars.
- For breakouts, TIP uses the prior window: the N bars before the signal bar, so the signal cannot raise its own ceiling or lower its own floor.
- TIP does not plot Donchian on the chart; breakout and breakdown read it behind the scenes.

## How TIP calculates it

- Highest high = max of highs in the window; lowest low = min of lows in the window.
- Prior highest high at signal time t uses bars t−N … t−1 (excludes t).
- Breakout detects when close_t > prior highest high; breakdown when close_t < prior lowest low.

## Formula (plain)

Prior ceiling = max high of the previous 20 bars (not including the signal bar). Prior floor = min low of those same bars.

## Formula (formal)

```
highest_high(window) = max(high of bars in window)
lowest_low(window) = min(low of bars in window)
prior_highest_high at t = max(high_{t−20} … high_{t−1})
prior_lowest_low at t = min(low_{t−20} … low_{t−1})
```

## Worked example

Five toy highs; TIP uses 20 in production with the same prior-window idea.

*Example uses N=5 prior bars; TIP uses 20.*

**Inputs**

| | |
| --- | --- |
| Prior highs (oldest→newest) | 100, 102, 101, 105, 103 |
| Signal bar high / close | 108 / 107 |

**Steps**

- Prior window highs = 100, 102, 101, 105, 103
- prior_highest_high = 105 (signal 108 is excluded)
- Close 107 > 105 → price break above prior ceiling

**Result:** TIP would treat 105 as the frozen breakout reference if the rest of the breakout rules pass.

## Scenarios

### Prior window (correct — excludes signal bar)

The key beginner trap: if you include the signal bar’s high in the ceiling, a breakout bar can never break above itself.

**Setup**

| | |
| --- | --- |
| Prior highs | 100, 102, 101, 105, 103 |
| Signal high / close | 108 / 107 |

**Timeline**

- Prior window · OHLC highs 100…103 · — Max = 105. This is the ceiling reference.
- Signal bar · OHLC H 108 / C 107 · — close 107 > 105 → qualifies as a break above the prior ceiling (for breakout’s price leg).

**References**

| Metric | Value |
| --- | --- |
| Prior highest high | 105 |
| If signal were included | max would be 108 (wrong for TIP) |

**Steps**

- Build the window from bars before the signal only.
- Freeze that max high (or min low for breakdown) at detect.
- Later lifecycle uses the frozen reference, not a moving channel.

**Result:** TIP freezes reference = 105 for a long breakout story. See the Breakout page for entry/stop/target after detect.

### No break (close still under ceiling)

A high wick above the ceiling is not enough — breakout needs close above the prior high.

**Setup**

| | |
| --- | --- |
| Prior highest high | 105 |
| Signal H/L/C | 106 / 103 / 104 |

**Steps**

- High 106 poked above 105, but close 104 is not > 105.
- Breakout detector does not fire on this bar.

**Result:** TIP would not Detect breakout — the close must clear the prior ceiling.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| period | 20 | `indicators.donchian.period` | Lookback length for high/low channel (DEFAULT_PERIOD = 20) |

## Flags

- Plotted on chart: no
- Closed candle only: yes

## Related

- [ATR (14)](./atr-14.md) (`indicator/atr-14`)
- [Breakout](./../patterns/breakout.md) (`pattern/breakout`)
- [Breakdown](./../patterns/breakdown.md) (`pattern/breakdown`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Price Channels (Donchian)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/price-channels) — Richard Donchian; N-period high / low channel (default 20)
- [StockCharts ChartSchool — Donchian Trading Guidelines](https://chartschool.stockcharts.com/table-of-contents/overview/donchian-trading-guidelines)
- [Investopedia — Donchian Channels](https://www.investopedia.com/terms/d/donchianchannels.asp)

**Docs**

- `docs/indicators/donchian-20.md`

**Code**

- `backend/app/indicators/donchian.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Volume SMA (20)

> **Kind:** indicator · **Slug:** `volume-sma-20` · **Group:** indicator
>
> SPA: /learn/indicators/volume-sma-20  
> Markdown: /learn-export/indicators/volume-sma-20.md

Average traded volume — the baseline for a “busy day” check.

---

## Plain English

- Volume SMA is a simple moving average of bar volume. It answers: “Is today’s volume large compared with recent bars?”
- On the chart, TIP draws a blue Volume SMA line on the volume pane (same period 20).
- Pattern detectors often use a prior average that excludes the signal bar, so the signal’s own volume does not inflate the baseline.

## How TIP calculates it

- Collect volume from the last N closed bars.
- Average = sum of those volumes ÷ N.
- For breakout confirmation, prior SMA uses the N bars before the signal bar (signal excluded).
- On the chart, the FE helper maps the same period across available candles for the blue line.

## Formula (plain)

Volume SMA = average of the last 20 bars’ volume. Prior SMA for a signal bar = average of the previous 20 bars only.

## Formula (formal)

```
SMA_t = (V_{t−n+1} + … + V_t) / n
prior_SMA at signal t = (V_{t−n} + … + V_{t−1}) / n
```

## Worked example

Check whether a signal bar is “busy” versus a toy 5-bar prior average.

*Example uses N=5; TIP uses 20.*

**Inputs**

| | |
| --- | --- |
| Prior volumes | 1000, 1200, 800, 1100, 900 |
| Signal volume | 2000 |
| Multiplier (breakout default) | 1.5× |

**Steps**

- prior SMA = 1000
- Threshold at 1.5× = 1500
- 2000 ≥ 1500 → volume confirmation passes

**Result:** Busy enough for breakout’s volume leg (toy window).

## Scenarios

### Busy enough for breakout volume leg

Breakout’s default confirmation wants detect-bar volume ≥ 1.5 × prior volume SMA. Volume breakout uses a stricter 2× by default.

**Setup**

| | |
| --- | --- |
| Prior volumes | 1000, 1200, 800, 1100, 900 |
| Prior SMA | 1000 |
| Signal volume | 2000 |
| Breakout multiplier | 1.5× → threshold 1500 |

**Timeline**

- Prior bars · — Average volume = 1000 (signal excluded from the baseline).
- Signal bar · — Volume 2000 ≥ 1500 → volume_ok for breakout confirmation.

**Steps**

- Always compare the signal to a baseline that does not include itself.
- On the chart, the blue line is the same period family so you can eye-check “busy vs quiet.”
- Volume breakout requires both high volume and a wide bar vs ATR — see that pattern page.

**Result:** TIP would count this as volume-confirmed for breakout’s volume leg (with the toy window).

### Too quiet (volume leg fails)

Same baseline, weaker signal volume — fails the 1.5× test.

**Setup**

| | |
| --- | --- |
| Prior SMA | 1000 |
| Signal volume | 1200 |
| Threshold 1.5× | 1500 |

**Steps**

- 1200 < 1500 → volume_ok is false.
- With confirmation_mode = both, breakout still needs the later close confirmation path and will not treat volume as OK.
- On index symbols with unusable volume, breakout falls back to close-only confirmation instead of inventing volume.

**Result:** TIP would not mark the volume leg OK. Close-fallback on indices is a different rule — not a fake volume number.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| period | 20 | `indicators.volume_sma.period` | Backend VolumeSmaIndicator.DEFAULT_PERIOD |
| VOLUME_SMA_PERIOD | 20 | `VOLUME_SMA_PERIOD` | Frontend chart constant (helpers.js) — must match backend |

## Flags

- Plotted on chart: yes
- Closed candle only: yes

## Related

- [Breakout](./../patterns/breakout.md) (`pattern/breakout`)
- [Volume breakout](./../patterns/volume_breakout.md) (`pattern/volume_breakout`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Moving Averages (SMA)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/moving-averages-simple-and-exponential) — Simple average of the last N values; TIP applies this to volume
- [StockCharts ChartSchool — Relative Volume (RVOL)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-volume-rvol) — Current volume vs a lookback average — same idea as breakout volume confirmation
- [Investopedia — Volume](https://www.investopedia.com/terms/v/volume.asp)

**Docs**

- `docs/indicators/volume-sma-20.md`

**Code**

- `backend/app/indicators/volume_sma.py`
- `frontend/src/chart/helpers.js`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Woodie support & resistance

> **Kind:** concept · **Slug:** `woodie-sr` · **Group:** context · **Direction:** both
>
> SPA: /learn/concepts/woodie-sr  
> Markdown: /learn-export/concepts/woodie-sr.md

Daily S/R ladder from yesterday’s range and today’s open — stamped on every pattern so Research can ask “at S2?” or “through R1?”.

---

## Plain English

- Support is a price where buyers often show up. Resistance is a price where sellers often show up. TIP does not guess these by eye — it computes a Woodie pivot ladder once per symbol at the start of the cash session.
- Woodie is special because today’s official open (first 09:15 IST trade) has half the weight of the pivot. A gap-up lifts the whole ladder; a gap-down lowers it. Classic floor pivots ignore the open and would miss that.
- This is not a new pattern. When a hammer, breakout, or any other setup is accepted, TIP stamps “where was this detect vs today’s S3…R3?” Those stamps never change later, just like volume-ok-at-detect.
- You use the stamps on Pattern Stats → Research: filter hammers at S2, breakouts that closed through R1, or gap-down days that opened through S2.

## Questions this answers

- How many successful hammers printed when we detected at S2 (bouncing off support)?
- Did this detect break down through S2 (support failed), or did it only sit near S2?
- Did a breakout also clear Woodie R1 on the signal bar?
- What happens on gap-up / gap-down days — did the stock open already through a named level?
- Is this long a confluence setup (long near support) or a break setup (long through resistance)?

## How to use it in TIP

- Open Pattern Stats as ADMIN and switch to Research. The Woodie S/R row has Nearest, Cross, Open through, and Gap.
- “At S2” (bounce / setup from support): Nearest = S2, turn on Near S/R and SR confluence. Example: hammers that fired next to S2.
- “Broke through S2” (support failed): Cross = s2 down. That means the detect candle traded at/above S2 and closed below it.
- “Cleared R1”: Cross = r1 up — the signal bar traded at/below R1 and closed above it.
- “Gapped through S2”: Open through = through S2 and Gap = down. The open itself was already below S2; that is not a signal-bar cross.
- Quality chips: Near S/R (within 0.5× the pattern’s ATR), SR confluence (long at S* or short at R*), SR break (long through R* or short through S*).
- Built-in presets: Hammer at S2, Breakout cleared R1, Gap through S2. Group by Nearest or Type · nearest to compare S2 vs R1 vs mid-range.
- Near uses the pattern timeframe ATR at detect, not daily ATR. A 5m hammer can be “near S2” while a 1d hammer at the same rupee distance is not.
- Cross / break filters skip older 5m (~60 days) and 15m (~90 days) backfill rows that have no signal candle. Historical open is that day’s 1d open except recent sessions when a 5m 09:15 bar was seeded.

## How TIP calculates it

- Take the last completed daily candle as previous day: high, low, close (never today’s still-open 1d bar).
- Wait for the first Regular Trading Hours print at 09:15 IST (the 1-minute bar open). That price is today’s open. Do not use pre-open / IEP or the clock flipping to OPEN with zero trades.
- Compute Woodie PP = (prevHigh + prevLow + 2 × todayOpen) / 4, then S1–S3 and R1–R3 from that PP and yesterday’s range. R4/S4 are stored but not used as Research filters.
- On a large gap, named levels can invert (S1 can sit above S2). “Gapped through S2” is the numeric test todayOpen < S2 — never a named-order bin.
- After a pattern passes the min-risk gate, stamp nearest named level, ATR distance, near?, signal-bar cross, confluence/break, gap direction, and open-through tokens. Missing daily history → leave the stamp empty (NULL), not “not near”.
- Levels persist for the IST session. A mid-day restart reuses the same 09:15 open + same previous daily bar.

## Formula (plain)

Pivot is a four-part average that double-counts today’s open. Supports and resistances are mirrors of yesterday’s high/low around that pivot. Distance to a level is measured in the pattern’s ATR at detect (default “near” = 0.5 ATR).

## Formula (formal)

```
range = prevHigh − prevLow
PP  = (prevHigh + prevLow + 2 × todayOpen) / 4
R1  = 2×PP − prevLow          S1 = 2×PP − prevHigh
R2  = PP + range              S2 = PP − range
R3  = prevHigh + 2×(PP − prevLow)
S3  = prevLow  − 2×(prevHigh − PP)
gap = todayOpen − prevClose
near ⇔ |entry − nearest| / atr_at_detect ≤ 0.5
cross_up(L)   = bar.low ≤ L and bar.close > L
cross_down(L) = bar.high ≥ L and bar.close < L
open through S2 ⇔ todayOpen < S2
```

## Lifecycle

- PRE_OPEN: no freeze (no official RTH open yet).
- First 09:15 print on the finest enabled TF (5m when 1m is off): persist daily_sr_levels for the IST session.
- Each accepted detect (after min-risk): stamp sr_* on the instance; never update later.
- Research reads those frozen fields. Dashboard pattern_statistics is unchanged.
- Startup / symbol add: seed 1d first, then recover today’s row from the 09:15 open (5m, or 1m when TIP_TIMEFRAME_1M_ENABLED).

## Worked example

Same previous day (H=12, L=10, C=11) under three opens: flat, large gap-down, then a hammer sitting on S2. Production uses these identities (`woodie_open_v1`).

*Daily Woodie ladder; “near” uses the detecting timeframe’s ATR, not daily ATR.*

**Inputs**

| | |
| --- | --- |
| Previous day H / L / C | 12 / 10 / 11 |
| Range | 2 |
| Flat open | 11 → PP = 11, S2 = 9, R1 = 12 |
| Gap-down open | 6 → PP = 8.5, S2 = 6.5, S1 = 5 |

**Steps**

- range = 12 − 10 = 2
- With open 11: PP = (12 + 10 + 22) / 4 = 11; R1 = 12; S1 = 10; R2 = 13; S2 = 9; R3 = 14; S3 = 8
- With open 6: PP = 8.5; S2 = 6.5; S1 = 5. Open 6 is below S2 but above S1 — gapped through S2, not through S1.
- A 5m hammer at 6.2 with ATR = 1 is 0.3 ATR from S2 → near + long confluence.

**Result:** Flat open gives a neat S3…R3 stack. A large gap-down inverts some names — Research still uses prices, so “through S2” stays honest.

## Scenarios

### Compute the ladder (open = yesterday’s close)

No gap. Woodie PP lands on 11, the same as a simple average of H, L, and C. The named levels line up in price order.

**Setup**

| | |
| --- | --- |
| Prev H / L / C | 12 / 10 / 11 |
| Today open | 11 (gap = 0, flat) |
| PP | 11 |
| S3 … R3 | 8, 9, 10, 11, 12, 13, 14 |

**Steps**

- Freeze yesterday’s completed 1d OHLC — not today’s forming daily bar.
- Wait for the first 09:15 print; that open is the only new input.
- PP double-counts the open so a later gap would have moved the whole map.

**Result:** With open = 11 the ladder is monotone: S3 < S2 < S1 < PP < R1 < R2 < R3.

### Large gap-down — names invert, “through S2” is numeric

Open 6 vs previous close 11 is a 5-point gap-down. Woodie PP drops to 8.5. S1 (5) is now below S2 (6.5). If we sorted levels by name we would wrongly say the open gapped through S1.

**Setup**

| | |
| --- | --- |
| Prev H / L / C | 12 / 10 / 11 |
| Today open | 6 (gap = −5) |
| PP / S2 / S1 / S3 | 8.5 / 6.5 / 5 / 3 |
| Open vs S2 | 6 < 6.5 → through S2 |
| Open vs S1 | 6 > 5 → not through S1 |

**Timeline**

- 09:15 open · close 6 · — First RTH print. Ladder freezes. gap_dir = down.
- Open-through tokens · — s2_down and pp_down. Not s3_down (6 ≮ 3) and not s1_down (6 ≮ 5).

**Stamp if a detect fires here**

| Metric | Value |
| --- | --- |
| sr_gap_dir | down |
| sr_open_through | s2_down,pp_down |
| sr_cross | none unless the signal bar actually trades a level |

**Steps**

- Never assume S1 is below S2 after a large gap.
- “Gapped through S2” is today_open < S2.
- A gap without trading the level is not a signal-bar cross.

**Rules**

- Freeze on first 09:15 print, not on the OPEN clock.
- Open-through tokens are numeric compares at stamp time.

**Measurements**

- gap = todayOpen − prevClose
- tokens include s2_down iff todayOpen < S2

**Result:** This is why TIP dropped named-order bins as Research filters — gap days are exactly when those bins invert.

### How to read a hammer at S2 in Research

Later a 5m hammer detects at 6.2 with ATR = 1. Nearest named level is S2 (6.5). Distance = 0.3 ATR → near. Long + S* + near → confluence. The bar did not close through S2, so this is “from S2”, not “broke S2”.

**Setup**

| | |
| --- | --- |
| Ladder | same gap-down day (S2 = 6.5) |
| Detect close / ATR | 6.2 / 1.0 |
| Direction | long (hammer) |
| Research stack | patternType=hammer, srNearest=s2, srNear, srConfluence |

**Steps**

- Nearest = argmin |entry − {S3,S2,S1,PP,R1,R2,R3}| (ties prefer PP, then direction).
- Near if distance ≤ 0.5 ATR (TIP_PATTERN_SR_NEAR_ATR).
- Confluence: long at S3/S2/S1 or short at R1/R2/R3, and near.
- Break: long with r1_up/r2_up/r3_up, or short with s3_down/s2_down/s1_down.
- Load the “Hammer at S2” Research preset to run this slice on the journal.

**Rules**

- Do not mix “at S2” (nearest) with “through S2” (cross).
- Dashboard stats table is not sliced by S/R — use Research.

**Measurements**

- distance_atr = |6.2 − 6.5| / 1 = 0.3
- sr_near = true; sr_confluence = true; sr_cross = none

**Result:** Research can now answer “did hammers at support outperform raw hammers?” without changing the pattern detector.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| pattern_sr_enabled | true | `pattern_sr_enabled` | Master switch: freeze daily levels and allow stamps |
| pattern_sr_stamp_enabled | true | `pattern_sr_stamp_enabled` | Stamp accepted detects (requires master on) |
| pattern_sr_research_enabled | true | `pattern_sr_research_enabled` | Allow Woodie filters on Research /query |
| pattern_sr_backfill_on_startup | false | `pattern_sr_backfill_on_startup` | After bootstrap, fill ~180d daily rows + unstamped instances |
| pattern_sr_near_atr | 0.5 | `pattern_sr_near_atr` | “Near” threshold in the detecting timeframe’s ATR |
| pattern_sr_method | woodie_open_v1 | `pattern_sr_method` | Ladder formula version (woodie_open_v1) |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Detector version hint: woodie_open_v1

## Related

- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)
- [Hammer](./../patterns/hammer.md) (`pattern/hammer`)
- [Breakout](./../patterns/breakout.md) (`pattern/breakout`)
- [Breakdown](./../patterns/breakdown.md) (`pattern/breakdown`)
- [Shooting star](./../patterns/shooting_star.md) (`pattern/shooting_star`)

## Sources

**Textbook / online**

- [MyPivots — Woodie Pivot Points](https://www.mypivots.com/dictionary/definition/228/woodie-pivot-points) — PP = (H + L + 2 × today’s open) / 4 — the open-weighted formula TIP uses
- [Sierra Chart — Pivot Points (Formula Type 3)](https://www.sierrachart.com/index.php?page=doc/PivotPoints.html) — PP = (yesterday H + L + current open + current open) / 4
- [eSignal — Woodie_Pivots.efs](https://efs.kb.esignal.com/hc/en-us/articles/6362892232987-Woodie-Pivots-efs) — PP = (yesterday H + yesterday L + (today open × 2)) / 4
- [thinkorswim — WoodiesPivots (Ken Wood)](https://toslc.thinkorswim.com/center/reference/Tech-Indicators/studies-library/V-Z/WoodiesPivots)
- [StockCharts ChartSchool — Pivot Points](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/pivot-points) — What a daily pivot ladder is; documents Standard (H+L+C)/3, not Woodie-open

**Docs**

- `docs/design-woodie-sr.md`

**Code**

- `backend/app/sr/woodie.py`
- `backend/app/sr/stamp.py`
- `backend/app/sr/service.py`
- `backend/app/patterns/evaluator.py`

*Last reviewed: 2026-08-18*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Breakout

> **Kind:** pattern · **Slug:** `breakout` · **Group:** range · **Direction:** long
>
> SPA: /learn/patterns/breakout  
> Markdown: /learn-export/patterns/breakout.md

Close above the prior 20-bar high, then track confirmation, retest, and targets.

---

## Plain English

- A breakout means price closed above a recent ceiling — the highest high of the previous 20 bars (not including the breakout bar itself).
- TIP then watches whether volume and/or later closes confirm the move, whether price retests the breakout level, whether it reclaims the detect close, and whether a virtual long reaches a target or fails.
- This is a long-only setup. Everything runs on closed candles only (no mid-bar repaint).

## How TIP calculates it

- On each closed bar, compute the prior Donchian high over 20 bars before this bar.
- If close > that reference, ATR is available, and anti-spam allows it, emit Detected and freeze the reference.
- Confirmation (default both): detect-bar volume ≥ 1.5 × prior volume SMA, and a later bar still closes above reference.
- Retest: a later low comes within 0.25×ATR of reference without closing below it. Does not need confirmation.
- Reclaim: after a retest, a later bar closes above the detect-bar entry. Same bar as the retest counts as reclaim only if it is bullish and closes above entry; a bearish same-bar is retest only.
- Strengthen: price extends about 1×ATR beyond reference.
- Succeeded: price reaches the detect-time target (about 2×ATR above reference). Failed: close back below reference. Retest and reclaim are flags only — they do not move entry, stop, or target.

## Formula (plain)

Reference = max high of the prior 20 bars. Detected when close > reference. Target and entry stay frozen at detect. A later retest / reclaim only set flags.

## Formula (formal)

```
reference = max(high_{t−20} … high_{t−1})
Detected when close_t > reference (ATR available)
volume ok: vol_t ≥ 1.5 × prior_SMA20(volume)
retest: after detect, low ≤ reference + 0.25×ATR and close ≥ reference (flag only; no confirm required)
reclaim: after retest, close > detect entry; same-bar reclaim only if bullish
target ≈ reference + 2×ATR (frozen at detect)
```

## Lifecycle

- Detected: close above prior 20-high; reference frozen
- Confirmed: volume and/or later close still above reference (mode-dependent)
- Retested: dip near reference without closing below (no confirm required)
- Reclaimed: after retest, close above the detect entry (same-bar only if bullish)
- Strengthened: extension about 1×ATR beyond reference
- Succeeded: target reached on a closed bar
- Failed: close back below reference
- Expired: session/bar limits by timeframe

## Worked example

Prior ceiling 100, ATR 2, detect close 101. Success hits target 104; fail closes back under 100. Both paths track MFE and MAE.

**Inputs**

| | |
| --- | --- |
| Prior Donchian high (reference) | 100 |
| ATR at detect | 2 |
| Detect close / high / low | 101 / 101.5 / 100.2 |
| Target | 100 + 2×2 = 104 |

**Steps**

- Detect freezes entry 101, stop 100, target 104, ATR 2
- Every open bar updates best high (for MFE) and worst low (for MAE)
- Fail if close < 100; succeed if high ≥ 104

**Result:** TIP journals both MFE(R) and MAE(R) whether the setup succeeds or fails — target/stop end the game; MFE/MAE score the path.

## Scenarios

### Success path (target hit, no retest)

Think of a virtual long trade. At detect, TIP freezes the rails. Each later closed bar first updates the path scoreboard (best high / worst low), then checks fail and success rules.

**Setup**

| | |
| --- | --- |
| Reference (prior 20-bar high) | 100 |
| ATR at detect (R-unit) | 2 |
| Detect O/H/L/C | 100.5 / 101.5 / 100.2 / 101 |
| Entry (detect close) | 101 |
| Stop (reference) | 100 |
| Target (no retest) | 100 + 2×ATR = 104 |

**Timeline**

- Bar 0 (detect) · OHLC O 100.5 / H 101.5 / L 100.2 / C 101 · — close 101 > 100 → Detected. Freeze entry 101, stop 100, target 104. Start path: best high 101.5, worst low 100.2.
- Bar 1 · OHLC H 102.0 / L 100.5 / C 101.8 · — Update scoreboard → best high 102, worst low still 100.2. Close not < 100; high not ≥ 104 → still open.
- Bar 2 (dip) · OHLC H 101.7 / L 100.1 / C 100.8 · — Worst low → 100.1 (more pain). Still close ≥ 100 → not failed. Still below target.
- Bar 3 (target) · OHLC H 104.3 / L 101.5 / C 103.9 · — Best high → 104.3. High ≥ 104 → Succeeded (price_target). Trade ends.

**After detect (bar 0)**

| Metric | Value |
| --- | --- |
| Entry / Stop / Target | 101 / 100 / 104 |
| MFE (R) | (101.5−101)/2 = 0.25 R |
| MAE (R) | (101−100.2)/2 = 0.40 R |
| Stage | Detected (open) |

**Final (bar 3 success)**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) | (104.3−101)/2 = 1.65 R |
| MAE (R) | (101−100.1)/2 = 0.45 R |
| Move (R) at end close | (103.9−101)/2 = 1.45 R |

**Steps**

- Detect only when a closed bar’s close is above the prior ceiling (signal bar not in that window).
- At detect: freeze entry, stop, first target, and ATR used as the R-unit.
- On every later bar: update best high / worst low first, then check fail (close < stop), then success (high ≥ target).
- MFE can exceed the target distance if price overshoots (here 104.3 vs target 104).
- Winners still have MAE — this success absorbed 0.45 R of adverse dip first.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** TIP marks Succeeded with MFE ≈ 1.65 R and MAE ≈ 0.45 R. Target decided the win; MFE/MAE describe how the path looked.

### Fail path (close back under reference)

Same detect rails. Price goes a little in favor, then a closed bar finishes below the stop/reference → Failed. MFE is still recorded.

**Setup**

| | |
| --- | --- |
| Same freeze as success story | entry 101, stop 100, target 104, ATR 2 |

**Timeline**

- Bar 0 (detect) · OHLC H 101.5 / L 100.2 / C 101 · — Detected; rails frozen.
- Bar 1 · OHLC H 102.0 / L 100.4 / C 101.5 · — Best high 102 → some favorable room. Still open.
- Bar 2 (fail) · OHLC H 101.0 / L 99.5 / C 99.7 · — Update worst low to 99.5, then close 99.7 < 100 → Failed (invalidation).

**Final (failed)**

| Metric | Value |
| --- | --- |
| Outcome | Failed |
| MFE (R) | (102−101)/2 = 0.50 R |
| MAE (R) | (101−99.5)/2 = 0.75 R |
| Note | Went +0.5 R first, then failed |

**Steps**

- Fail rule for breakout: closed bar close < reference/stop.
- Scoreboard still keeps the best high seen before failure (MFE).
- MAE often reaches beyond the stop if the low wicks further (99.5 vs stop 100).

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** TIP marks Failed with both MFE and MAE filled in. Fail does not mean “only MAE matters.”

### Retest is a quality flag — target stays frozen

After detect (confirmation not required), if price dips into the retest band near the reference without closing below it, TIP sets flag_retested and records the retest floor. The take-profit stays the detect-time ATR target.

**Setup**

| | |
| --- | --- |
| Reference | 100 |
| ATR | 2 |
| Detect target | 100 + 2×2 = 104 |
| Retest band (0.25×ATR) | 100 + 0.5 = up to 100.5 zone |
| Example retest floor (low) | 99.5 (still close ≥ 100) |

**Steps**

- Detect freezes target at 104. A valid retest only sets flag_retested and retest_floor.
- MFE/MAE continue updating from highs/lows independently of the flag.
- Success still means price reaches the original target.

**Result:** Require-retest filters which setups you take. It never moves the rails.

### Reclaim is a later close through detect entry

Entry stays the detect close. After a retest, a later close back above that entry is Reclaimed. If one bar both tags the retest band and closes above entry, a bullish candle is reclaim; a bearish candle is retest only.

**Setup**

| | |
| --- | --- |
| Reference | 100 |
| Detect entry | 101 |
| ATR | 2 |
| Retest band | up to 100.5 |

**Steps**

- Detect freezes entry at 101. Retest and reclaim never rewrite it.
- A bearish dip into the band that closes under entry is retest only.
- A later close above 101 is reclaim. Same-bar reclaim needs a bullish close above entry.

**Result:** Reclaim is a quality stage (chart marker RCL). The virtual trade still uses the detect-time entry.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| lookback_candles | 20 | `breakout.lookback_candles` | Bars in the prior high window (excludes signal bar) |
| volume_avg_period | 20 | `breakout.volume_avg_period` | Bars in prior volume average |
| confirmation_mode | both | `breakout.confirmation_mode` | volume \| close \| both \| close_fallback |
| volume_multiplier | 1.5 | `breakout.volume_multiplier` | Detect volume must be ≥ this × prior SMA |
| retest_atr_mult | 0.25 | `breakout.retest_atr_mult` | How close a dip to reference counts as retest (flag only) |
| strengthen_atr_mult | 1 | `breakout.strengthen_atr_mult` | Extension beyond reference for Strengthened |
| success_rr | 2 | `breakout.success_rr` | Unused. Retest is a flag only and never rewrites target |
| success_atr_mult_without_retest | 2 | `breakout.success_atr_mult_without_retest` | Target distance in ATR, frozen at detect |
| detector_version | breakout-v1 | `breakout.detector_version` | Journal / support version tag |
| atr_period | 14 | `atr_period` | ATR length used for bands and R-unit |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Index volume note: On index symbols or when volume is unusable, confirmation falls back to close-only (CLOSE_FALLBACK).
- Pattern type id: `breakout`
- Detector version hint: breakout-v1

## Related

- [Donchian (20)](./../indicators/donchian-20.md) (`indicator/donchian-20`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)
- [Volume SMA (20)](./../indicators/volume-sma-20.md) (`indicator/volume-sma-20`)
- [Breakdown](./breakdown.md) (`pattern/breakdown`)
- [Woodie S/R](./../concepts/woodie-sr.md) (`concept/woodie-sr`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Price Channels (Donchian)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/price-channels) — Close above the N-period high is the channel breakout
- [Investopedia — Breakout](https://www.investopedia.com/terms/b/breakout.asp)

**Docs**

- `docs/patterns/breakout.md`

**Code**

- `backend/app/patterns/breakout.py`

*Last reviewed: 2026-09-18*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Breakdown

> **Kind:** pattern · **Slug:** `breakdown` · **Group:** range · **Direction:** short
>
> SPA: /learn/patterns/breakdown  
> Markdown: /learn-export/patterns/breakdown.md

Close below the prior 20-bar low — the short mirror of breakout.

---

## Plain English

- A breakdown is the short-side twin of breakout: price closes below the lowest low of the previous 20 bars (signal bar excluded).
- TIP tracks confirmation, retest of the floor from below, reclaim of the detect close, extension, and virtual short success/fail the same way as breakout, but mirrored.
- Closed candles only; reference is frozen at detect.

## How TIP calculates it

- Compute prior Donchian low over 20 bars before the signal bar.
- Detected when close < that reference (ATR available, anti-spam OK).
- Confirmation mirrors breakout: volume and/or later close still below reference.
- Retest: high comes within 0.25×ATR of reference without closing back above it. Does not need confirmation.
- Reclaim: after a retest, a later bar closes below the detect-bar entry. Same bar as the retest counts as reclaim only if it is bearish and closes below entry; a bullish same-bar is retest only.
- Succeeded toward a downside target; Failed if close returns above reference. Retest and reclaim do not move entry, stop, or target.

## Formula (plain)

Reference = min low of the prior 20 bars. Detected when close < reference. Targets and retests use ATR multiples like breakout, flipped for shorts.

## Formula (formal)

```
reference = min(low_{t−20} … low_{t−1})
Detected when close_t < reference
retest: after detect, high ≥ reference − 0.25×ATR and close ≤ reference (no confirm required)
reclaim: after retest, close < detect entry; same-bar reclaim only if bearish
```

## Lifecycle

- Detected: close below prior 20-low
- Confirmed: volume and/or later close still below reference
- Retested: bounce near floor (no confirm required)
- Reclaimed: after retest, close below the detect entry (same-bar only if bearish)
- Strengthened: extension about 1×ATR beyond floor
- Succeeded / Failed / Expired: mirrored short outcomes

## Worked example

Prior floor 50, ATR 2, detect close 49. Short target without retest ≈ 46. Success pushes lower; fail reclaims above 50.

**Inputs**

| | |
| --- | --- |
| Prior Donchian low | 50 |
| ATR | 2 |
| Detect close | 49 |
| Target | 50 − 2×2 = 46 |

**Steps**

- Detect freezes short entry 49, stop 50, target 46
- Favorable = price falling; adverse = price rising
- Fail if close > 50; succeed if low ≤ 46

**Result:** Same mental model as breakout, mirrored for shorts — both MFE and MAE on every outcome.

## Scenarios

### Success path (downside target hit)

Virtual short: profit when price falls. At detect TIP freezes rails. Each bar updates path extremes, then checks reclaim-fail and target-success.

**Setup**

| | |
| --- | --- |
| Reference (prior 20-bar low) | 50 |
| ATR at detect | 2 |
| Detect H/L/C | 49.8 / 48.5 / 49 |
| Entry (detect close) | 49 |
| Stop (reference) | 50 |
| Target (no retest) | 50 − 2×ATR = 46 |

**Timeline**

- Bar 0 (detect) · OHLC H 49.8 / L 48.5 / C 49 · — close 49 < 50 → Detected short. Freeze entry 49, stop 50, target 46.
- Bar 1 · OHLC H 49.5 / L 47.5 / C 48 · — Price drops — favorable for short. Still above target 46; close still ≤ 50 → open.
- Bar 2 (bounce) · OHLC H 49.6 / L 47.8 / C 48.5 · — Bounce raises adverse excursion (pain for short) but close 48.5 still under stop 50.
- Bar 3 (target) · OHLC H 47.0 / L 45.5 / C 46.2 · — Low 45.5 ≤ 46 → Succeeded. Trade ends.

**Final (success)**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) short | (49 − 45.5)/2 = 1.75 R |
| MAE (R) short | (49.6 − 49)/2 = 0.30 R |

**Steps**

- Detect when close breaks under the prior floor.
- MFE for shorts uses how far price fell from entry; MAE uses how far it rose against you.
- Success and fail both keep both measurements.

**Rules**

- Stop / invalidation: a closed bar that reclaims the stop ends the setup as Failed.
- Target: when price reaches the downside target (low for shorts), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in the short direction (price falling) while open, ÷ ATR at detect.
- MAE (R): worst move against the short (price rising) while open, ÷ ATR at detect.
- Both are recorded on success and fail — not “win-only” or “loss-only” metrics.

**Result:** TIP marks Succeeded short with both MFE and MAE filled — target was the win rule.

### Fail path (reclaim above reference)

Price dips a little, then a closed bar finishes back above the floor → Failed short.

**Setup**

| | |
| --- | --- |
| Rails | entry 49, stop 50, target 46, ATR 2 |

**Timeline**

- Bar 0 (detect) · OHLC H 49.8 / L 48.5 / C 49 · — Detected short.
- Bar 1 · OHLC H 49.2 / L 48.0 / C 48.4 · — Some favorable drop (MFE grows). Still open.
- Bar 2 (fail) · OHLC H 50.8 / L 48.8 / C 50.4 · — close 50.4 > 50 → Failed (reclaim). Adverse high 50.8 updates MAE.

**Final (failed)**

| Metric | Value |
| --- | --- |
| Outcome | Failed |
| MFE (R) | (49 − 48.0)/2 = 0.50 R |
| MAE (R) | (50.8 − 49)/2 = 0.90 R |

**Steps**

- Fail rule: close back above the reference/stop.
- You still record how far the short went in favor before failing (MFE).

**Rules**

- Stop / invalidation: a closed bar that reclaims the stop ends the setup as Failed.
- Target: when price reaches the downside target (low for shorts), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in the short direction (price falling) while open, ÷ ATR at detect.
- MAE (R): worst move against the short (price rising) while open, ÷ ATR at detect.
- Both are recorded on success and fail — not “win-only” or “loss-only” metrics.

**Result:** TIP marks Failed with MFE and MAE both present — same scoreboard idea as breakout.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| lookback_candles | 20 | `breakdown.lookback_candles` | Bars in the prior low window |
| volume_avg_period | 20 | `breakdown.volume_avg_period` | Bars in prior volume average |
| confirmation_mode | both | `breakdown.confirmation_mode` | volume \| close \| both \| close_fallback |
| volume_multiplier | 1.5 | `breakdown.volume_multiplier` | Volume threshold multiple |
| retest_atr_mult | 0.25 | `breakdown.retest_atr_mult` | Retest band in ATR (flag only; does not move target) |
| strengthen_atr_mult | 1 | `breakdown.strengthen_atr_mult` | Extension multiple for Strengthened |
| success_rr | 2 | `breakdown.success_rr` | Unused. Retest is a flag only and never rewrites target |
| success_atr_mult_without_retest | 2 | `breakdown.success_atr_mult_without_retest` | Target distance in ATR, frozen at detect |
| detector_version | breakdown-v1 | `breakdown.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Index volume note: On index symbols or when volume is unusable, confirmation falls back to close-only (CLOSE_FALLBACK).
- Pattern type id: `breakdown`
- Detector version hint: breakdown-v1

## Related

- [Breakout](./breakout.md) (`pattern/breakout`)
- [Donchian (20)](./../indicators/donchian-20.md) (`indicator/donchian-20`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Price Channels (Donchian)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/price-channels) — Close below the N-period low is the channel breakdown
- [Investopedia — Breakdown](https://www.investopedia.com/terms/b/breakdown.asp)

**Docs**

- `docs/patterns/breakdown.md`

**Code**

- `backend/app/patterns/breakdown.py`

*Last reviewed: 2026-09-18*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Consolidation

> **Kind:** pattern · **Slug:** `consolidation` · **Group:** range · **Direction:** regime
>
> SPA: /learn/patterns/consolidation  
> Markdown: /learn-export/patterns/consolidation.md

A multi-bar tight range vs ATR — a volatility regime, not a buy/sell call at detect.

---

## Plain English

- Consolidation means the last several bars are squeezed into a small high–low range compared with ATR (normal move size).
- It is a regime signal: “price is coiling.” It is not a directional long trade signal at detect even if the stored direction field is a placeholder long.
- Useful context before expansion; TIP journals how the range resolves over time.

## How TIP calculates it

- Look at the last window_candles closed bars (default 10).
- Range R = max high − min low in that window.
- If R ≤ range_atr_mult × ATR, the window is tight → Detected (and prior window was not already tight — avoids re-detect spam).
- Freeze range high/low and mid; track until expansion outside the box, or max duration.

## Formula (plain)

Tight when (highest high − lowest low) over the last 10 bars is at most 1.5 × ATR.

## Formula (formal)

```
R = max(high) − min(low) over last M bars
tight if R ≤ κ × ATR, M=10, κ=1.5
```

## Lifecycle

- Detected: window range ≤ κ×ATR (regime, not directional entry)
- May tighten further if range shrinks (tighten_ratio)
- Succeeded: closed expand above range high or below range low
- Failed: max duration without expansion
- Closed-candle only throughout

## Worked example

Window high 105 / low 103, ATR 2 → R=2 ≤ 3 → detect regime. Expansion close outside box succeeds; max duration can fail.

**Inputs**

| | |
| --- | --- |
| Window high / low | 105 / 103 |
| R / ATR / κ | 2 / 2 / 1.5 |
| Threshold | 3 |

**Steps**

- R=2 ≤ 3 → Detected
- Mid label = 104 (not a buy price recommendation)
- Close > 105 or < 103 later → expansion success

**Result:** Regime detect only — not “go long at mid.”

## Scenarios

### Detect tight range → expand out (Succeeded)

TIP labels a coil when the recent box is small vs ATR. Leaving the box on a closed bar resolves the regime as Succeeded (expansion), not “price target hit” in the breakout sense.

**Setup**

| | |
| --- | --- |
| Window (10 bars) high / low | 105 / 103 |
| Range R | 2 |
| ATR | 2 |
| κ × ATR threshold | 1.5 × 2 = 3 |
| Frozen box | low 103, high 105, mid 104 |

**Timeline**

- Detect bar · OHLC inside 103–105 · — R=2 ≤ 3 and prior window was not already tight → Detected. Freeze box. Mid=104 is a label only.
- Later bar (still in box) · OHLC H 104.5 / L 103.2 / C 104 · — Still inside → remains open; path extremes update; duration ticks up.
- Expansion bar · OHLC H 106.5 / L 104 / C 106 · — close 106 > 105 → Succeeded with reason expand_up.

**At detect**

| Metric | Value |
| --- | --- |
| Regime | Consolidation (tight) |
| Box | 103 – 105 |
| Mid (label) | 104 |

**Steps**

- Tightness is range vs ATR, not a candle shape alone.
- Do not trade the mid as a breakout entry from this page alone.
- Expansion up or down both count as Succeeded resolution of the regime.

**Rules**

- Detect means the range is tight vs ATR — a regime label, not a buy or sell call.
- Expansion: close outside the frozen range high/low ends as Succeeded (resolved by expansion).
- Max duration without expansion can end as Failed (timed out still compressed).

**Measurements**

- Path extremes (best high / worst low while open) are still tracked for research.
- Do not read consolidation “entry” as a directional long recommendation — mid-range is a midpoint label only.

**Result:** TIP marks Succeeded (expand_up). That means the coil resolved outward — not a directional “long target hit.”

### Still compressed too long (Failed max duration)

If the box never expands before max_duration_candles, the instance can end as Failed with reason max_duration.

**Setup**

| | |
| --- | --- |
| Same box | 103 – 105 |
| max_duration_candles | 30 (default) |

**Steps**

- Each new bar inside the box increases duration.
- If duration hits the max while still inside → Failed (timed out).
- That is different from a directional stop-out on a long trade.

**Rules**

- Detect means the range is tight vs ATR — a regime label, not a buy or sell call.
- Expansion: close outside the frozen range high/low ends as Succeeded (resolved by expansion).
- Max duration without expansion can end as Failed (timed out still compressed).

**Measurements**

- Path extremes (best high / worst low while open) are still tracked for research.
- Do not read consolidation “entry” as a directional long recommendation — mid-range is a midpoint label only.

**Result:** TIP can mark Failed for timeout without ever “invalidating a long.” Read it as regime unresolved.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| window_candles | 10 | `consolidation.window_candles` | Bars in the compression window |
| range_atr_mult | 1.5 | `consolidation.range_atr_mult` | Max range as multiple of ATR to count as tight |
| max_duration_candles | 30 | `consolidation.max_duration_candles` | How long a consolidation instance may live |
| tighten_ratio | 0.85 | `consolidation.tighten_ratio` | Further squeeze threshold vs prior range |
| detector_version | consolidation-v1 | `consolidation.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length for the tightness test |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Pattern type id: `consolidation`
- Detector version hint: consolidation-v1

## Related

- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)
- [Inside bar](./inside_bar.md) (`pattern/inside_bar`)
- [Breakout](./breakout.md) (`pattern/breakout`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Rectangle](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/rectangle) — Multi-bar congestion / trading range
- [StockCharts ChartSchool — Bollinger Band Squeeze](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/bollinger-band-squeeze) — Volatility compression before expansion
- [StockCharts ChartSchool — Narrow Range Day (NR7)](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7) — Related compression idea; TIP uses ATR-normalized multi-bar range, not NR7

**Docs**

- `docs/patterns/consolidation.md`

**Code**

- `backend/app/patterns/consolidation.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Volume breakout

> **Kind:** pattern · **Slug:** `volume_breakout` · **Group:** range · **Direction:** both
>
> SPA: /learn/patterns/volume_breakout  
> Markdown: /learn-export/patterns/volume_breakout.md

Unusually large volume plus a wide bar — even without a Donchian break.

---

## Plain English

- Volume breakout looks for a climax bar: volume much larger than average and a bar range that is meaningful vs ATR.
- Unlike price breakout, it does not require breaking the 20-bar high or low. Direction follows the bar’s close vs open.
- It does not fire on index symbols where volume is unusable (skip, not close-fallback).

## How TIP calculates it

- Compute prior volume SMA over 20 bars (signal excluded) and ATR(14).
- Volume OK if signal volume ≥ 2× prior SMA.
- Move OK if high−low ≥ 0.5×ATR.
- Both required → Detected; long if close ≥ open, else short.
- Then short lifecycle: confirm beyond signal extreme, target 1.5×ATR, or fail at signal high/low stop.

## Formula (plain)

Detect when volume ≥ 2× prior average and bar range ≥ 0.5×ATR. Long if close ≥ open, else short.

## Formula (formal)

```
volOk = volume_t ≥ 2.0 × prior_SMA20(volume)
moveOk = (high_t − low_t) ≥ 0.5 × ATR
direction = long if close ≥ open else short
```

## Lifecycle

- Detected: volume surge + wide bar (not necessarily Donchian break)
- Confirmed: later close beyond signal high (long) or low (short)
- Succeeded: ~1.5×ATR from entry
- Failed: close through signal stop (low for long / high for short)

## Worked example

Prior vol SMA 1M, signal 2.2M, ATR 4, green bar range 3 → long detect. Target entry+1.5×ATR; stop at signal low.

**Inputs**

| | |
| --- | --- |
| Prior vol SMA | 1,000,000 |
| Signal volume | 2,200,000 |
| ATR | 4 |
| Signal O/H/L/C | 100 / 103 / 100 / 102.5 |

**Steps**

- 2.2M ≥ 2×1M and range 3 ≥ 0.5×4 → Detect long
- Entry 102.5, stop 100, target 102.5+6 = 108.5

**Result:** Long volume_breakout with short lifecycle; never fires on index symbols.

## Scenarios

### Long success (volume + wide bar → target)

No Donchian ceiling required. A busy, wide green bar starts a virtual long. Later bars update MFE/MAE; target is entry + 1.5×ATR.

**Setup**

| | |
| --- | --- |
| Prior volume SMA | 1,000,000 |
| Signal volume | 2,200,000 (≥ 2×) |
| ATR | 4 |
| Signal O/H/L/C | 100 / 103 / 100 / 102.5 |
| Range vs 0.5×ATR | 3 ≥ 2 → move OK |
| Entry / stop / target | 102.5 / 100 / 108.5 |

**Timeline**

- Bar 0 (detect) · OHLC O 100 / H 103 / L 100 / C 102.5 · — vol+range OK, close ≥ open → Detected long. Freeze rails. Path starts at high 103 / low 100.
- Bar 1 · OHLC H 105 / L 101.5 / C 104 · — Best high 105. Not failed (close ≥ stop). Not at target yet. May confirm if close > signal high 103.
- Bar 2 (target) · OHLC H 109 / L 104 / C 108 · — High 109 ≥ 108.5 → Succeeded (on a bar after detect).

**Final**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) | (109−102.5)/4 = 1.625 R |
| MAE (R) | (102.5−100)/4 = 0.625 R |

**Steps**

- Both volume and range gates must pass on the same closed bar.
- Stop is the signal low for longs (signal high for shorts).
- Target is 1.5×ATR from entry in the trade direction.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Succeeded long volume_breakout; MFE/MAE both journaled.

### Fail stop — or never detect on index

Two different “no win” stories: (1) equity bar detects then fails through stop; (2) index symbol never detects.

**Setup**

| | |
| --- | --- |
| Same long rails | entry 102.5, stop 100, target 108.5 |

**Timeline**

- Bar 0 (detect) · OHLC H 103 / L 100 / C 102.5 · — Detected on a normal equity with usable volume.
- Bar 1 (fail) · OHLC H 102 / L 99 / C 99.5 · — close 99.5 < stop 100 → Failed. MAE uses worst low 99.

**Steps**

- Fail: close through the signal-side stop.
- Index segment: detector returns no pattern at all (not close-fallback).
- Quiet volume or tiny range: also no detect.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Equity path can Fail with MFE/MAE filled. Index path never opens a volume_breakout instance.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| volume_avg_period | 20 | `volume_breakout.volume_avg_period` | Prior volume SMA length |
| volume_multiplier | 2 | `volume_breakout.volume_multiplier` | Volume multiple required (default 2×) |
| min_range_atr_mult | 0.5 | `volume_breakout.min_range_atr_mult` | Min bar range vs ATR |
| success_atr_mult | 1.5 | `volume_breakout.success_atr_mult` | Target distance in ATR |
| max_candles_after_detect | 20 | `volume_breakout.max_candles_after_detect` | Max bars to live after detect |
| detector_version | volume-breakout-v1 | `volume_breakout.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Index volume note: Does not fire on index symbols (volume unusable → no detect). This is not CLOSE_FALLBACK.
- Pattern type id: `volume_breakout`
- Detector version hint: volume-breakout-v1

## Related

- [Volume SMA (20)](./../indicators/volume-sma-20.md) (`indicator/volume-sma-20`)
- [Breakout](./breakout.md) (`pattern/breakout`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Relative Volume (RVOL)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-volume-rvol) — Unusual volume vs a lookback average
- [StockCharts ChartSchool — On Balance Volume](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/on-balance-volume-obv) — Volume confirms price commitment (Elder / Granville lineage)
- [Investopedia — Volume](https://www.investopedia.com/terms/v/volume.asp)

**Docs**

- `docs/patterns/volume-breakout.md`

**Code**

- `backend/app/patterns/volume_breakout.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Hammer

> **Kind:** pattern · **Slug:** `hammer` · **Group:** candlestick · **Direction:** long
>
> SPA: /learn/patterns/hammer  
> Markdown: /learn-export/patterns/hammer.md

Long lower wick, small body — potential bullish pin after pressure lower.

---

## Plain English

- A hammer is a pin-bar shape: a small real body near the top of the range and a long lower shadow, suggesting buyers pushed back after selling.
- TIP only uses closed bars and applies size filters vs ATR so tiny noise bars do not count.
- By default it also wants simple downtrend context so the shape is more reversal-like.

## How TIP calculates it

- On the signal bar: body = |close−open|, range = high−low, lower wick, upper wick.
- Require range ≥ 0.5×ATR, body ≤ 0.35×range, lower wick ≥ 2×body, upper wick ≤ 0.25×range.
- If require_trend_context is on, check a simple prior down-bias over trend_lookback.
- Detected → short lifecycle to confirm higher, hit 1.5×ATR target, or fail.

## Formula (plain)

Long lower shadow at least twice the body; small body; tiny upper wick; bar not microscopic vs ATR.

## Formula (formal)

```
body = |close − open|; range = high − low
lower ≥ 2×body; upper ≤ 0.25×range; body ≤ 0.35×range
range ≥ 0.5×ATR
```

## Lifecycle

- Detected: hammer geometry on closed bar (+ optional trend context)
- Confirmed: later close beyond signal high
- Succeeded: ~1.5×ATR from entry
- Failed: close through stop under the pin

## Worked example

Bar opens 100, trades to 94, closes 99.5; ATR is 4. Geometry passes → long pin lifecycle.

**Inputs**

| | |
| --- | --- |
| O/H/L/C | 100 / 100.2 / 94 / 99.5 |
| ATR | 4 |

**Steps**

- body 0.5, range 6.2, lower ~5.5 → geometry OK
- Entry ~99.5; target ~99.5+1.5×4; stop under the pin low

**Result:** Detected hammer when geometry (+ context) pass.

## Scenarios

### Detect geometry → target success

First TIP checks candle geometry on the closed bar. If it passes, it freezes a virtual long with stop under the pin and target about 1.5×ATR above entry.

**Setup**

| | |
| --- | --- |
| Signal O/H/L/C | 100 / 100.2 / 94 / 99.5 |
| ATR | 4 |
| body / range / lower / upper | 0.5 / 6.2 / ≈5.5 / ≈0.2 |
| Entry (close) | 99.5 |
| Stop (under pin) | near 94 |
| Target (~1.5×ATR) | 99.5 + 6 = 105.5 |

**Timeline**

- Bar 0 (detect) · OHLC O 100 / H 100.2 / L 94 / C 99.5 · — range ≥ 0.5×ATR, lower ≥ 2×body, small upper → Detected long hammer. Path starts high 100.2 / low 94.
- Bar 1 · OHLC H 102 / L 98 / C 101 · — Update MFE/MAE. May confirm if close clears signal high. Still open.
- Bar 2 (target) · OHLC H 106 / L 101 / C 105 · — High ≥ 105.5 → Succeeded.

**Final**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) | (106−99.5)/4 ≈ 1.63 R |
| MAE (R) | (99.5−94)/4 ≈ 1.38 R (pin low on detect counts) |

**Steps**

- Geometry is checked only on closed bars.
- ATR filters out tiny pins.
- After detect, the short lifecycle is the same family as other long virtual trades (confirm / target / stop).

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Succeeded hammer: target rule ends the trade; MFE/MAE still describe the path.

### Fail through stop under the pin

After detect, a closed bar finishes under the pin low → Failed. MFE may still show a bounce first.

**Setup**

| | |
| --- | --- |
| Entry / stop | 99.5 / ~94 |

**Timeline**

- Bar 0 · OHLC H 100.2 / L 94 / C 99.5 · — Detected.
- Bar 1 · OHLC H 101 / L 97 / C 100 · — Small bounce — some MFE. Still open.
- Bar 2 (fail) · OHLC H 98 / L 92 / C 93 · — close under stop → Failed. MAE uses the worst low.

**Steps**

- Stop lives under the hammer’s low region.
- Failure still records how far price went in favor first (MFE).

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Failed hammer with both MFE and MAE present.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| shadow_body_mult | 2 | `pinbar.shadow_body_mult` | Dominant wick must be ≥ this × body |
| max_body_range_ratio | 0.35 | `pinbar.max_body_range_ratio` | Max body as fraction of full range |
| max_opposite_wick_range_ratio | 0.25 | `pinbar.max_opposite_wick_range_ratio` | Max opposite wick as fraction of range |
| min_range_atr_mult | 0.5 | `pinbar.min_range_atr_mult` | Min full range vs ATR |
| success_atr_mult | 1.5 | `pinbar.success_atr_mult` | Target distance in ATR |
| require_trend_context | true | `pinbar.require_trend_context` | Require simple prior trend bias |
| trend_lookback | 10 | `pinbar.trend_lookback` | Bars used for trend context |
| max_candles_after_detect | 20 | `pinbar.max_candles_after_detect` | Max bars after detect |
| detector_version | pinbar-v1 | `pinbar.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Pattern type id: `hammer`
- Detector version hint: pinbar-v1

## Related

- [Shooting star](./shooting_star.md) (`pattern/shooting_star`)
- [Bullish engulfing](./bullish_engulfing.md) (`pattern/bullish_engulfing`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)
- [Woodie S/R](./../concepts/woodie-sr.md) (`concept/woodie-sr`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Hammer](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary#hammer) — Long lower shadow; close well above the session low
- [StockCharts ChartSchool — Bullish reversal candlesticks](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-bullish-reversal-patterns)
- [Investopedia — Hammer](https://www.investopedia.com/terms/h/hammer.asp)

**Docs**

- `docs/patterns/hammer-shooting-star.md`

**Code**

- `backend/app/patterns/pinbar.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Shooting star

> **Kind:** pattern · **Slug:** `shooting_star` · **Group:** candlestick · **Direction:** short
>
> SPA: /learn/patterns/shooting_star  
> Markdown: /learn-export/patterns/shooting_star.md

Long upper wick, small body — potential bearish pin after a push higher.

---

## Plain English

- A shooting star is the upside-down pin: long upper shadow, small body near the lows of the range — sellers rejected higher prices.
- TIP shares the same pinbar geometry package as hammer, but flipped, and treats it as a short setup.
- Closed candles only; optional prior uptrend context when enabled.

## How TIP calculates it

- Measure body, range, upper and lower wicks on the closed signal bar.
- Require upper wick ≥ 2×body, lower wick ≤ 0.25×range, body ≤ 0.35×range, range ≥ 0.5×ATR.
- Optional trend context: simple prior up-bias.
- Short lifecycle: confirm lower, target 1.5×ATR, or fail.

## Formula (plain)

Long upper shadow at least twice the body; small body; tiny lower wick; meaningful range vs ATR.

## Formula (formal)

```
upper ≥ 2×body; lower ≤ 0.25×range; body ≤ 0.35×range
range ≥ 0.5×ATR
```

## Lifecycle

- Detected: shooting-star geometry on closed bar
- Confirmed: later close below signal low
- Succeeded: ~1.5×ATR downside
- Failed: close through stop above the pin

## Worked example

Bar spikes to 110 then closes 101; ATR is 3. Geometry passes → short pin lifecycle.

**Inputs**

| | |
| --- | --- |
| O/H/L/C | 102 / 110 / 100.8 / 101 |
| ATR | 3 |

**Steps**

- upper large, body small → Detected short
- Target ≈ entry − 1.5×ATR; stop above the pin high

**Result:** Detected shooting star when rules pass.

## Scenarios

### Detect → downside target success

Geometry on the closed bar starts a virtual short. Favorable path is lower prices; stop sits above the upper wick region.

**Setup**

| | |
| --- | --- |
| Signal O/H/L/C | 102 / 110 / 100.8 / 101 |
| ATR | 3 |
| Entry | 101 |
| Stop (above pin) | near 110 |
| Target (~1.5×ATR) | 101 − 4.5 = 96.5 |

**Timeline**

- Bar 0 (detect) · OHLC O 102 / H 110 / L 100.8 / C 101 · — Upper wick dominates → Detected short. Path extremes start here.
- Bar 1 · OHLC H 102 / L 98 / C 99 · — Price falls — MFE grows for the short. Still open if above target.
- Bar 2 (target) · OHLC H 98 / L 96 / C 96.8 · — Low ≤ 96.5 → Succeeded.

**Final**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) short | (101−96)/3 ≈ 1.67 R |
| MAE (R) short | includes spike toward 110 on detect path |

**Steps**

- Same pin package as hammer, flipped for shorts.
- Target uses success_atr_mult (default 1.5) from entry.

**Rules**

- Stop / invalidation: a closed bar that reclaims the stop ends the setup as Failed.
- Target: when price reaches the downside target (low for shorts), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in the short direction (price falling) while open, ÷ ATR at detect.
- MAE (R): worst move against the short (price rising) while open, ÷ ATR at detect.
- Both are recorded on success and fail — not “win-only” or “loss-only” metrics.

**Result:** Succeeded shooting star with MFE/MAE both recorded.

### Fail — close reclaims above the pin

After detect, price rips back through the stop above the star → Failed.

**Setup**

| | |
| --- | --- |
| Entry / stop | 101 / ~110 |

**Timeline**

- Bar 0 · OHLC H 110 / L 100.8 / C 101 · — Detected short.
- Bar 1 · OHLC H 103 / L 99 / C 100 · — Some follow-through lower (MFE). Still open.
- Bar 2 (fail) · OHLC H 112 / L 104 / C 111 · — close above stop → Failed. MAE reflects the adverse run-up.

**Steps**

- Short fails when price closes through the stop above the pin.
- MFE can still be non-zero if price dipped first.

**Rules**

- Stop / invalidation: a closed bar that reclaims the stop ends the setup as Failed.
- Target: when price reaches the downside target (low for shorts), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in the short direction (price falling) while open, ÷ ATR at detect.
- MAE (R): worst move against the short (price rising) while open, ÷ ATR at detect.
- Both are recorded on success and fail — not “win-only” or “loss-only” metrics.

**Result:** Failed shooting star — both path metrics kept.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| shadow_body_mult | 2 | `pinbar.shadow_body_mult` | Dominant wick must be ≥ this × body |
| max_body_range_ratio | 0.35 | `pinbar.max_body_range_ratio` | Max body as fraction of full range |
| max_opposite_wick_range_ratio | 0.25 | `pinbar.max_opposite_wick_range_ratio` | Max opposite wick as fraction of range |
| min_range_atr_mult | 0.5 | `pinbar.min_range_atr_mult` | Min full range vs ATR |
| success_atr_mult | 1.5 | `pinbar.success_atr_mult` | Target distance in ATR |
| require_trend_context | true | `pinbar.require_trend_context` | Require simple prior trend bias |
| trend_lookback | 10 | `pinbar.trend_lookback` | Bars used for trend context |
| max_candles_after_detect | 20 | `pinbar.max_candles_after_detect` | Max bars after detect |
| detector_version | pinbar-v1 | `pinbar.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Pattern type id: `shooting_star`
- Detector version hint: pinbar-v1

## Related

- [Hammer](./hammer.md) (`pattern/hammer`)
- [Bearish engulfing](./bearish_engulfing.md) (`pattern/bearish_engulfing`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Shooting Star](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary#shooting_star) — Long upper shadow; close near the open after a failed rally
- [StockCharts ChartSchool — Bearish reversal candlesticks](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-bearish-reversal-patterns)
- [Investopedia — Shooting Star](https://www.investopedia.com/terms/s/shootingstar.asp)

**Docs**

- `docs/patterns/hammer-shooting-star.md`

**Code**

- `backend/app/patterns/pinbar.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Bullish engulfing

> **Kind:** pattern · **Slug:** `bullish_engulfing` · **Group:** candlestick · **Direction:** long
>
> SPA: /learn/patterns/bullish_engulfing  
> Markdown: /learn-export/patterns/bullish_engulfing.md

A green body that fully covers the prior red body — two-bar bullish reversal shape.

---

## Plain English

- Bullish engulfing needs two closed bars: a bearish bar, then a larger bullish bar whose body covers the prior body.
- TIP also requires the signal bar range to be meaningful vs ATR so tiny bars do not fire.
- After detect, a short virtual trade tracks confirmation above the signal high and a 1.5×ATR target.

## How TIP calculates it

- Prior bar must be bearish (close < open); signal bullish (close > open).
- Signal open ≤ prior close and signal close ≥ prior open (body engulfs).
- Signal range ≥ 0.5×ATR.
- Entry at signal close; stop near the two-bar low; confirm on later close above signal high.

## Formula (plain)

Second bar is green and its body completely covers the first bar’s body; bar is large enough vs ATR.

## Formula (formal)

```
close_{t−1} < open_{t−1}; close_t > open_t
open_t ≤ close_{t−1} and close_t ≥ open_{t−1}
range_t ≥ 0.5×ATR
```

## Lifecycle

- Detected: body engulf + ATR size filter
- Confirmed: later close > signal high
- Succeeded: entry + ~1.5×ATR
- Failed: close below two-bar low stop

## Worked example

Red 105→102, then green opens 101.5 closes 106; ATR 2 → detect long.

**Inputs**

| | |
| --- | --- |
| Prior O/C | 105 / 102 |
| Signal O/H/L/C | 101.5 / 106.5 / 101 / 106 |
| ATR | 2 |

**Steps**

- Bodies engulf + range OK → Detected
- Entry 106; target 106+3=109; stop near two-bar low

**Result:** Long bullish_engulfing with short lifecycle.

## Scenarios

### Two-bar detect → target success

Detect needs both bars closed. Rails freeze on the engulfing bar. Later bars update MFE/MAE and apply stop/target.

**Setup**

| | |
| --- | --- |
| Prior (bearish) O/C | 105 / 102 |
| Signal O/H/L/C | 101.5 / 106.5 / 101 / 106 |
| ATR | 2 |
| Entry / target | 106 / 109 (1.5×ATR) |
| Stop region | near min lows of the two bars (~101) |

**Timeline**

- Prior bar · OHLC O 105 / C 102 · — Bearish body — first half of the pattern (not a detect yet).
- Bar 0 (detect) · OHLC O 101.5 / H 106.5 / L 101 / C 106 · — Bullish body engulfs prior body; range ≥ 0.5×ATR → Detected long.
- Bar 1 · OHLC H 108 / L 105 / C 107 · — Path updates; may confirm above signal high 106.5. Still open.
- Bar 2 (target) · OHLC H 110 / L 107 / C 109.5 · — High ≥ 109 → Succeeded.

**Final**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) | (110−106)/2 = 2.0 R |
| MAE (R) | (106−101)/2 = 2.5 R |

**Steps**

- Body engulf is about open/close relationships, not necessarily full wicks.
- ATR size filter blocks micro engulfs.
- Stop uses the two-bar low region; target is ATR-based from entry.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Succeeded engulfing long; MFE/MAE both journaled.

### Fail through two-bar low stop

After detect, price closes back under the stop region → Failed.

**Setup**

| | |
| --- | --- |
| Entry / stop | 106 / ~101 |

**Timeline**

- Bar 0 · OHLC H 106.5 / L 101 / C 106 · — Detected.
- Bar 1 (fail) · OHLC H 105 / L 99 / C 100 · — close under stop → Failed. MAE uses worst low 99.

**Steps**

- Even a clean engulf can fail quickly — journal keeps path metrics either way.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Failed bullish_engulfing with MFE/MAE present.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| min_range_atr_mult | 0.5 | `engulfing.min_range_atr_mult` | Min signal range vs ATR |
| success_atr_mult | 1.5 | `engulfing.success_atr_mult` | Target distance in ATR |
| max_candles_after_detect | 20 | `engulfing.max_candles_after_detect` | Max bars after detect |
| detector_version | engulfing-v1 | `engulfing.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Pattern type id: `bullish_engulfing`
- Detector version hint: engulfing-v1

## Related

- [Bearish engulfing](./bearish_engulfing.md) (`pattern/bearish_engulfing`)
- [Hammer](./hammer.md) (`pattern/hammer`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Engulfing Pattern](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary#engulfing_pattern) — Body engulfs prior body (not necessarily the full high–low range)
- [StockCharts ChartSchool — Bullish reversal candlesticks](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-bullish-reversal-patterns)
- [Investopedia — Bullish Engulfing](https://www.investopedia.com/terms/b/bullishengulfingpattern.asp)

**Docs**

- `docs/patterns/engulfing.md`

**Code**

- `backend/app/patterns/engulfing.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Bearish engulfing

> **Kind:** pattern · **Slug:** `bearish_engulfing` · **Group:** candlestick · **Direction:** short
>
> SPA: /learn/patterns/bearish_engulfing  
> Markdown: /learn-export/patterns/bearish_engulfing.md

A red body that fully covers the prior green body — two-bar bearish reversal shape.

---

## Plain English

- Bearish engulfing mirrors the bullish case: a bullish prior bar, then a larger bearish body that covers it.
- TIP filters on ATR so the signal bar has meaningful size.
- Virtual short: confirm under the signal low; target about 1.5×ATR.

## How TIP calculates it

- Prior bullish; signal bearish; signal body engulfs prior body.
- range_t ≥ min_range_atr_mult × ATR.
- Stop near two-bar high; confirm on later close below signal low.

## Formula (plain)

Second bar is red and its body completely covers the first bar’s body; bar large enough vs ATR.

## Formula (formal)

```
close_{t−1} > open_{t−1}; close_t < open_t
open_t ≥ close_{t−1} and close_t ≤ open_{t−1}
range_t ≥ 0.5×ATR
```

## Lifecycle

- Detected: bearish body engulf + ATR filter
- Confirmed: later close < signal low
- Succeeded: entry − ~1.5×ATR
- Failed: close above two-bar high stop

## Worked example

Green 100→104, red opens 104.5 closes 99.5; ATR 2 → detect short.

**Inputs**

| | |
| --- | --- |
| Prior O/C | 100 / 104 |
| Signal O/C | 104.5 / 99.5 |
| ATR | 2 |

**Steps**

- Engulf + size OK → Detected short
- Target ≈ 99.5 − 3 = 96.5; stop near two-bar high

**Result:** Short bearish_engulfing lifecycle.

## Scenarios

### Detect → downside target success

Two closed bars form the shape. Virtual short freezes entry at signal close; favorable path is lower.

**Setup**

| | |
| --- | --- |
| Prior (bullish) O/C | 100 / 104 |
| Signal O/H/L/C | 104.5 / 105 / 99 / 99.5 |
| ATR | 2 |
| Entry / target | 99.5 / 96.5 |
| Stop region | near two-bar high (~105) |

**Timeline**

- Prior bar · OHLC O 100 / C 104 · — Bullish first bar.
- Bar 0 (detect) · OHLC O 104.5 / H 105 / L 99 / C 99.5 · — Bearish body engulfs → Detected short.
- Bar 1 (target) · OHLC H 99 / L 96 / C 96.8 · — Low ≤ 96.5 → Succeeded.

**Final**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) | (99.5−96)/2 = 1.75 R |
| MAE (R) | (105−99.5)/2 = 2.75 R |

**Steps**

- Mirror of bullish engulfing.
- Stop sits near the two-bar high; target is ATR-based below entry.

**Rules**

- Stop / invalidation: a closed bar that reclaims the stop ends the setup as Failed.
- Target: when price reaches the downside target (low for shorts), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in the short direction (price falling) while open, ÷ ATR at detect.
- MAE (R): worst move against the short (price rising) while open, ÷ ATR at detect.
- Both are recorded on success and fail — not “win-only” or “loss-only” metrics.

**Result:** Succeeded short engulfing with MFE/MAE filled.

### Fail — reclaim above two-bar high

Price closes back above the stop region → Failed short.

**Setup**

| | |
| --- | --- |
| Entry / stop | 99.5 / ~105 |

**Timeline**

- Bar 0 · OHLC H 105 / L 99 / C 99.5 · — Detected short.
- Bar 1 (fail) · OHLC H 107 / L 101 / C 106 · — close above stop → Failed.

**Steps**

- Failed shorts still keep any favorable dip as MFE.

**Rules**

- Stop / invalidation: a closed bar that reclaims the stop ends the setup as Failed.
- Target: when price reaches the downside target (low for shorts), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in the short direction (price falling) while open, ÷ ATR at detect.
- MAE (R): worst move against the short (price rising) while open, ÷ ATR at detect.
- Both are recorded on success and fail — not “win-only” or “loss-only” metrics.

**Result:** Failed bearish_engulfing with both path metrics.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| min_range_atr_mult | 0.5 | `engulfing.min_range_atr_mult` | Min signal range vs ATR |
| success_atr_mult | 1.5 | `engulfing.success_atr_mult` | Target distance in ATR |
| max_candles_after_detect | 20 | `engulfing.max_candles_after_detect` | Max bars after detect |
| detector_version | engulfing-v1 | `engulfing.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Pattern type id: `bearish_engulfing`
- Detector version hint: engulfing-v1

## Related

- [Bullish engulfing](./bullish_engulfing.md) (`pattern/bullish_engulfing`)
- [Shooting star](./shooting_star.md) (`pattern/shooting_star`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Engulfing Pattern](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary#engulfing_pattern) — Body engulfs prior body (not necessarily the full high–low range)
- [StockCharts ChartSchool — Bearish reversal candlesticks](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-bearish-reversal-patterns)
- [Investopedia — Bearish Engulfing](https://www.investopedia.com/terms/b/bearishengulfingp.asp)

**Docs**

- `docs/patterns/engulfing.md`

**Code**

- `backend/app/patterns/engulfing.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Inside bar

> **Kind:** pattern · **Slug:** `inside_bar` · **Group:** range · **Direction:** both
>
> SPA: /learn/patterns/inside_bar  
> Markdown: /learn-export/patterns/inside_bar.md

A bar fully inside the mother bar, then a close that breaks the mother range.

---

## Plain English

- An inside bar is a pause: the middle bar’s high and low sit entirely inside the previous “mother” bar.
- TIP waits for a third bar that closes outside the mother’s range — that break sets long or short.
- Mother bar must be large enough vs ATR so the pattern is not pure noise.

## How TIP calculates it

- Identify mother (t−2), inside (t−1), break (t).
- Inside: high lower than mother high and low higher than mother low.
- Long break: close_t > mother high; short break: close_t < mother low.
- Mother range ≥ 0.5×ATR; then short lifecycle with mother extreme as stop.

## Formula (plain)

Middle bar inside mother; signal bar closes outside mother high (long) or low (short).

## Formula (formal)

```
high_{t−1} < high_{t−2} and low_{t−1} > low_{t−2}
long: close_t > high_{t−2}; short: close_t < low_{t−2}
range_mother ≥ 0.5×ATR
```

## Lifecycle

- Detected: mother + inside + break close outside mother
- Confirmed: later close still beyond mother extreme
- Succeeded: ~1.5×ATR from entry
- Failed: close back through mother stop side

## Worked example

Mother 100–110; inside 102–108; break closes 111 → long inside_bar.

**Inputs**

| | |
| --- | --- |
| Mother H/L | 110 / 100 |
| Inside H/L | 108 / 102 |
| Break close | 111 |
| ATR | 4 |

**Steps**

- Inside fully within mother
- close 111 > 110 → long Detected
- Stop references mother low 100; target entry+1.5×ATR

**Result:** Long inside_bar on the closed third bar.

## Scenarios

### Mother + inside + upside break → success

Three closed bars. Detect happens on the break bar, not on the inside bar alone. Then a normal long virtual trade runs.

**Setup**

| | |
| --- | --- |
| Mother H/L | 110 / 100 |
| Mother range vs ATR | 10 ≥ 0.5×ATR (ATR=4 → need ≥2) |
| Inside H/L | 108 / 102 |
| Break O/H/L/C | 108 / 112 / 107 / 111 |
| Entry / stop / target | 111 / 100 / 111+6 = 117 |

**Timeline**

- Mother · OHLC H 110 / L 100 · — Wide bar — the container.
- Inside · OHLC H 108 / L 102 · — Fully inside mother. Not a detect yet.
- Bar 0 (break / detect) · OHLC H 112 / L 107 / C 111 · — close 111 > mother high 110 → Detected long. Freeze rails.
- Bar 1 (target) · OHLC H 118 / L 112 / C 116 · — High ≥ 117 → Succeeded.

**Final**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) | (118−111)/4 = 1.75 R |
| MAE (R) | (111−107)/4 = 1.0 R |

**Steps**

- Detect only on the break close outside the mother.
- Stop for a long uses the mother low side.
- Short break would be close under mother low (mirror story).

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Succeeded long inside_bar; path metrics journaled.

### Fail — break then back through mother stop

After a long detect, price closes back through the mother low → Failed.

**Setup**

| | |
| --- | --- |
| Entry / stop | 111 / 100 |

**Timeline**

- Bar 0 · OHLC C 111 · — Detected long break.
- Bar 1 (fail) · OHLC H 110 / L 98 / C 99 · — close under mother low stop → Failed.

**Steps**

- False breakouts are exactly why both success and fail paths matter in stats.
- MFE may be small if price never ran after the break.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Failed inside_bar after a false upside break.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| min_mother_range_atr_mult | 0.5 | `inside_bar.min_mother_range_atr_mult` | Min mother range vs ATR |
| success_atr_mult | 1.5 | `inside_bar.success_atr_mult` | Target distance in ATR |
| max_candles_after_detect | 20 | `inside_bar.max_candles_after_detect` | Max bars after detect |
| max_bars_after_inside | 5 | `inside_bar.max_bars_after_inside` | Related timing window after inside bar |
| detector_version | inside-bar-v1 | `inside_bar.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Pattern type id: `inside_bar`
- Detector version hint: inside-bar-v1

## Related

- [Consolidation](./consolidation.md) (`pattern/consolidation`)
- [Breakout](./breakout.md) (`pattern/breakout`)

## Sources

**Textbook / online**

- [Investopedia — Inside Day](https://www.investopedia.com/terms/i/inside-day.asp) — High and low contained in the prior bar’s range (mother–inside)
- [StockCharts ChartSchool — Narrow Range Day (NR7)](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7) — Related compression-then-expansion idea; TIP fires on a close through the mother, not NR7 rank

**Docs**

- `docs/patterns/inside-bar.md`

**Code**

- `backend/app/patterns/inside_bar.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Higher high

> **Kind:** pattern · **Slug:** `higher_high` · **Group:** structure · **Direction:** long
>
> SPA: /learn/patterns/higher_high  
> Markdown: /learn-export/patterns/higher_high.md

A confirmed swing high that is higher than the previous swing high.

---

## Plain English

- Higher high is a market-structure idea: a new swing peak is higher than the last swing peak.
- TIP finds swing highs with a fractal width (default 2): a bar’s high is strictly above neighbors on both sides, only after the right-side bars have closed (no repaint).
- Then it tracks a long-biased virtual trade from that structure break.

## How TIP calculates it

- With fractal_width N=2, a pivot high at i is confirmed when bar i+N has closed.
- If that pivot high is greater than the previous pivot high → higher_high Detected.
- Entry on the confirm bar close; stop near prior swing low; confirm and target use ATR multiples.

## Formula (plain)

A bar is a swing high when its high is higher than the highs of the two bars on each side. A higher high is a new swing high above the previous one.

## Formula (formal)

```
pivot high at i if high_i > high_j for all j in [i−N, i+N] except i (N=2)
higher_high if high_i > previous pivot high
```

## Lifecycle

- Detected: confirmed pivot high > prior pivot high
- Confirmed: later close above the new structure high
- Succeeded: ~1.5×ATR
- Failed: close through structure stop (prior swing low area)

## Worked example

Prior pivot high 100; new confirmed pivot high 105 with N=2 → Detected long structure.

**Inputs**

| | |
| --- | --- |
| Prior pivot high | 100 |
| New pivot high | 105 |
| fractal_width | 2 |
| ATR | 2 |

**Steps**

- Wait for right-side bars to close (non-repaint)
- 105 > 100 → higher_high Detected
- Target ~ entry + 1.5×ATR; stop near prior swing low

**Result:** Detected once the new pivot is confirmed and higher.

## Scenarios

### Confirmed higher pivot → target success

Structure patterns are slower than single-candle pins: the pivot is only real after neighbor bars on the right have closed. Then a virtual long runs.

**Setup**

| | |
| --- | --- |
| Prior swing high | 100 |
| New swing high (pivot) | 105 |
| fractal_width N | 2 |
| ATR | 2 |
| Entry (confirm bar close) | 104 (example) |
| Target (~1.5×ATR) | 104 + 3 = 107 |
| Stop region | near prior swing low (example 98) |

**Timeline**

- Pivot bar · OHLC H 105 · — Candidate swing high — not confirmed until N bars to the right close.
- Confirm (+N bars) · OHLC neighbors closed; C 104 · — Pivot locked at 105 > prior 100 → Detected higher_high. Freeze rails.
- Later (target) · OHLC H 108 / C 107 · — High ≥ 107 → Succeeded.

**Final**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) | (108−104)/2 = 2.0 R |
| Structure note | Non-repainting pivot confirmation |

**Steps**

- Never treat an unconfirmed mid-pivot as final — right bars must close.
- Higher high compares successive confirmed pivots, not every bar high.
- After detect, stop/target/MFE/MAE follow the usual virtual long idea.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Succeeded higher_high structure trade with path metrics.

### Fail through structure stop

After detect, price closes through the prior swing-low stop region → Failed.

**Setup**

| | |
| --- | --- |
| Entry / stop | 104 / ~98 |

**Timeline**

- Detect · — higher_high confirmed.
- Fail bar · OHLC L 97 / C 97.5 · — close through stop → Failed. MAE captures the adverse run.

**Steps**

- Structure can fail like any virtual trade — journal still stores MFE/MAE.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Failed higher_high with both path metrics kept.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| fractal_width | 2 | `structure.fractal_width` | Neighbor bars each side for swing pivots |
| success_atr_mult | 1.5 | `structure.success_atr_mult` | Target distance in ATR |
| max_candles_after_detect | 30 | `structure.max_candles_after_detect` | Max bars after detect (structure uses 30) |
| detector_version | structure-v1 | `structure.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Pattern type id: `higher_high`
- Detector version hint: structure-v1

## Related

- [Lower low](./lower_low.md) (`pattern/lower_low`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Alligator (Bill Williams)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/alligator) — Williams fractals: a high/low that is the extreme of the surrounding N bars
- [StockCharts ChartSchool — Swing Charting](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/swing-charting)
- [Investopedia — Fractal (Williams)](https://www.investopedia.com/terms/f/fractal.asp) — Five-bar fractal (width 2) is the default Williams definition; TIP default width is also 2

**Docs**

- `docs/patterns/hh-ll.md`

**Code**

- `backend/app/patterns/structure.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Lower low

> **Kind:** pattern · **Slug:** `lower_low` · **Group:** structure · **Direction:** short
>
> SPA: /learn/patterns/lower_low  
> Markdown: /learn-export/patterns/lower_low.md

A confirmed swing low that is lower than the previous swing low.

---

## Plain English

- Lower low is the bearish structure twin of higher high: a new swing trough under the previous one.
- Swings use the same fractal width and non-repainting confirmation (right-side bars must close).
- TIP journals a short-biased virtual trade from that structure.

## How TIP calculates it

- Pivot low at i when low_i is strictly below neighbors in [i−N, i+N], confirmed at i+N.
- If new pivot low < previous pivot low → lower_low Detected.
- Stop near prior swing high; target ~1.5×ATR.

## Formula (plain)

A bar is a swing low when its low is lower than the lows of neighbors on both sides. A lower low is a new swing low under the previous one.

## Formula (formal)

```
pivot low at i if low_i < low_j for j in [i−N, i+N] except i
lower_low if low_i < previous pivot low
```

## Lifecycle

- Detected: confirmed pivot low < prior pivot low
- Confirmed: later close below the new structure low
- Succeeded: ~1.5×ATR downside
- Failed: close through structure stop (prior swing high area)

## Worked example

Prior pivot low 50; new confirmed pivot low 47 → Detected short structure.

**Inputs**

| | |
| --- | --- |
| Prior pivot low | 50 |
| New pivot low | 47 |
| ATR | 2 |

**Steps**

- Confirm pivot with right-side bars closed
- 47 < 50 → lower_low Detected
- Target ~ entry − 1.5×ATR; stop near prior swing high

**Result:** Detected on the confirmed lower pivot.

## Scenarios

### Confirmed lower pivot → downside target

Same non-repainting pivot rules as higher high, flipped for lows. Virtual short after confirmation.

**Setup**

| | |
| --- | --- |
| Prior swing low | 50 |
| New swing low | 47 |
| fractal_width N | 2 |
| ATR | 2 |
| Entry (confirm close) | 48 (example) |
| Target (~1.5×ATR) | 48 − 3 = 45 |
| Stop region | near prior swing high (example 52) |

**Timeline**

- Pivot low bar · OHLC L 47 · — Candidate — wait for right neighbors to close.
- Confirm (+N) · OHLC C 48 · — 47 < 50 → Detected lower_low. Freeze short rails.
- Later (target) · OHLC L 44.5 / C 45.2 · — Low ≤ 45 → Succeeded.

**Final**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) short | (48−44.5)/2 = 1.75 R |

**Steps**

- Pivots confirm only after the right-side window closes.
- Compare successive confirmed troughs, not every bar low.

**Rules**

- Stop / invalidation: a closed bar that reclaims the stop ends the setup as Failed.
- Target: when price reaches the downside target (low for shorts), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in the short direction (price falling) while open, ÷ ATR at detect.
- MAE (R): worst move against the short (price rising) while open, ÷ ATR at detect.
- Both are recorded on success and fail — not “win-only” or “loss-only” metrics.

**Result:** Succeeded lower_low with path metrics.

### Fail through prior swing-high stop

After detect, price closes back above the structure stop → Failed short.

**Setup**

| | |
| --- | --- |
| Entry / stop | 48 / ~52 |

**Timeline**

- Detect · — lower_low confirmed.
- Fail bar · OHLC H 53 / C 52.5 · — close through stop → Failed. MAE captures the squeeze higher.

**Steps**

- Structure fails are first-class journal outcomes, same as candle patterns.

**Rules**

- Stop / invalidation: a closed bar that reclaims the stop ends the setup as Failed.
- Target: when price reaches the downside target (low for shorts), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in the short direction (price falling) while open, ÷ ATR at detect.
- MAE (R): worst move against the short (price rising) while open, ÷ ATR at detect.
- Both are recorded on success and fail — not “win-only” or “loss-only” metrics.

**Result:** Failed lower_low with MFE/MAE kept.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| fractal_width | 2 | `structure.fractal_width` | Neighbor bars each side for swing pivots |
| success_atr_mult | 1.5 | `structure.success_atr_mult` | Target distance in ATR |
| max_candles_after_detect | 30 | `structure.max_candles_after_detect` | Max bars after detect (structure uses 30) |
| detector_version | structure-v1 | `structure.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Pattern type id: `lower_low`
- Detector version hint: structure-v1

## Related

- [Higher high](./higher_high.md) (`pattern/higher_high`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Alligator (Bill Williams)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/alligator) — Williams fractals: a high/low that is the extreme of the surrounding N bars
- [StockCharts ChartSchool — Swing Charting](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/swing-charting)
- [Investopedia — Fractal (Williams)](https://www.investopedia.com/terms/f/fractal.asp) — Five-bar fractal (width 2) is the default Williams definition; TIP default width is also 2

**Docs**

- `docs/patterns/hh-ll.md`

**Code**

- `backend/app/patterns/structure.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Double bottom

> **Kind:** pattern · **Slug:** `double_bottom` · **Group:** structure · **Direction:** long
>
> SPA: /learn/patterns/double_bottom  
> Markdown: /learn-export/patterns/double_bottom.md

Two similar troughs; long when a closed bar breaks the intervening peak.

---

## Plain English

- A double bottom is a W: price makes a low, bounces, retests a similar low, then closes above the bounce high.
- TIP only fires after every swing is a confirmed fractal (no repaint) and the break is a close, not a wick.
- Stop sits below the lower trough. Target is the height of the W projected up. A dip back through the peak does not fail the trade until the trough stop is hit — that occupies the one-open slot for this family.

## Questions this answers

- When did a classical measured-move pattern actually trigger (close through the line)?
- Did the virtual trade hit the measured target, the structural stop, or expire?

## How to use it in TIP

- Research default maxRiskR=1.5 hides many of these (structural stops are wide). Use the Classical measured-move preset or raise maxRiskR.
- A close back through the neckline/peak that does not pierce the stop keeps the family slot until stop, target, or session expiry.

## How TIP calculates it

- Scan confirmed pivot lows/highs (same fractals as higher-high / lower-low).
- Pair the newest valid W whose first close above the peak is the current bar.
- Freeze entry (close), confirmation line (peak), stop (lower trough − buffer), measured target.

## Formula (plain)

Two confirmed swing lows within an ATR band, with a peak between them. Detected on the first close above that peak.

## Formula (formal)

```
|L2−L1| band: −max_second_deeper_atr ≤ (L2−L1)/ATR ≤ trough_tolerance_atr
Detected when first close > peak after L2 is confirmed
```

## Lifecycle

- Detected: first close above the peak after the second trough is confirmed
- Confirmed: later close still above the peak (default close mode)
- Retested: dip into the peak + 0.25×ATR without closing back below — target unchanged
- Strengthened: 1×ATR extension through the peak
- Succeeded: high reaches measured target (not on the detect bar)
- Failed: close through the trough stop
- Expired: max bars after detect, or session close on 15m

## Worked example

Troughs 100 / 100.4, peak 108, ATR 2. Close 108.3 detects long; target 116.

**Inputs**

| | |
| --- | --- |
| Trough 1 | 100 |
| Peak | 108 |
| Trough 2 | 100.4 |
| ATR | 2 |
| Break close | 108.3 |
| Stop | 99.70 |
| Target | 116 |

**Steps**

- Both troughs confirmed as fractals; |Δ| = 0.2 ATR inside the equality band.
- First close above 108 is 108.3 → Detected. Rails freeze.
- Later high 116.5 ≥ 116 → Succeeded.

**Result:** Succeeded double_bottom at the measured move.

## Scenarios

### W breaks the peak and reaches the measured move

Troughs 100 / 100.4, peak 108, ATR 2. Close 108.3 detects long; target 116.

**Setup**

| | |
| --- | --- |
| Trough 1 | 100 |
| Peak | 108 |
| Trough 2 | 100.4 |
| ATR | 2 |
| Break close | 108.3 |
| Stop | 99.70 |
| Target | 116 |

**Steps**

- Both troughs confirmed as fractals; |Δ| = 0.2 ATR inside the equality band.
- First close above 108 is 108.3 → Detected. Rails freeze.
- Later high 116.5 ≥ 116 → Succeeded.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Succeeded double_bottom at the measured move.

### Break then close through the trough stop

Same W detects; a later close below 99.70 fails. A close back under 108 that stays above the stop does not fail — it occupies the slot.

**Setup**

| | |
| --- | --- |
| Entry | 108.3 |
| Peak / ref | 108 |
| Stop | 99.70 |

**Steps**

- Detected as above.
- Close 99.5 < 99.70 → Failed (invalidation). Fail wins if the same bar also tags the target.

**Result:** Failed double_bottom; family slot frees for a new W.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| confirmation_mode | close | `double.confirmation_mode` |  |
| detector_version | double-v1 | `double.detector_version` |  |
| enable_bottom | true | `double.enable_bottom` |  |
| enable_top | true | `double.enable_top` |  |
| enabled | true | `double.enabled` |  |
| fractal_width | 2 | `double.fractal_width` |  |
| log_rejects | false | `double.log_rejects` |  |
| lookback_candles | 80 | `double.lookback_candles` |  |
| max_candles_after_detect | 40 | `double.max_candles_after_detect` |  |
| max_height_atr | 8 | `double.max_height_atr` |  |
| max_pivot_separation | 50 | `double.max_pivot_separation` |  |
| max_second_deeper_atr | 0.25 | `double.max_second_deeper_atr` |  |
| measured_move_frac | 1 | `double.measured_move_frac` |  |
| min_height_atr | 1 | `double.min_height_atr` |  |
| min_pivot_separation | 5 | `double.min_pivot_separation` |  |
| retest_atr_mult | 0.25 | `double.retest_atr_mult` |  |
| stop_buffer_atr | 0.15 | `double.stop_buffer_atr` |  |
| strengthen_atr_mult | 1 | `double.strengthen_atr_mult` |  |
| success_atr_mult | 1.5 | `double.success_atr_mult` |  |
| target_mode | measured | `double.target_mode` |  |
| trough_tolerance_atr | 0.35 | `double.trough_tolerance_atr` |  |
| volume_avg_period | 20 | `double.volume_avg_period` |  |
| volume_multiplier | 1.5 | `double.volume_multiplier` |  |
| atr_period | 14 | `atr_period` | ATR length used as the R unit |

## Flags

- Plotted on chart: yes
- Closed candle only: yes
- Pattern type id: `double_bottom`
- Detector version hint: double-v1

## Related

- [Double top](./double_top.md) (`pattern/double_top`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Double Bottom Reversal](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/double-bottom-reversal) — W geometry; pattern is not complete until the intervening peak breaks; measured-move target
- [Bulkowski — Double Bottom types](https://thepatternsite.com/DoubleBottomTypes.html) — Encyclopedia of Chart Patterns identification
- [Bulkowski — Double Bottom setup](https://thepatternsite.com/dbsetup.html) — Confirms when price closes above the intervening peak (confirmation line)
- [Investopedia — Double Bottom](https://www.investopedia.com/terms/d/doublebottom.asp)

**Docs**

- `docs/patterns/double-bottom.md`

**Code**

- `backend/app/patterns/double.py`
- `backend/app/patterns/geometry.py`

*Last reviewed: 2026-08-27*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Double top

> **Kind:** pattern · **Slug:** `double_top` · **Group:** structure · **Direction:** short
>
> SPA: /learn/patterns/double_top  
> Markdown: /learn-export/patterns/double_top.md

Two similar peaks; short when a closed bar breaks the intervening trough.

---

## Plain English

- A double top is an M: two similar highs around a dip, then a close below the dip.
- TIP shares the double-bottom engine: prices are negated so the W scanner runs unchanged.
- Stop is above the higher peak. Target is the M height projected down.

## Questions this answers

- When did a classical measured-move pattern actually trigger (close through the line)?
- Did the virtual trade hit the measured target, the structural stop, or expire?

## How to use it in TIP

- Research default maxRiskR=1.5 hides many of these (structural stops are wide). Use the Classical measured-move preset or raise maxRiskR.
- A close back through the neckline/peak that does not pierce the stop keeps the family slot until stop, target, or session expiry.

## How TIP calculates it

- Invert candles, run the W pairing, emit unsigned rails as a short.
- One open double_bottom or double_top per symbol×timeframe.

## Formula (plain)

Two confirmed swing highs within an ATR band, with a trough between them. Detected on the first close below that trough.

## Formula (formal)

```
Same engine as double bottom with signed candles (sign=−1).
Detected when first close < trough after H2 is confirmed.
```

## Lifecycle

- Detected: first close below the trough
- Confirmed: later close still below the trough
- Retested: bounce into the trough − 0.25×ATR without closing back above
- Succeeded: low reaches the measured target
- Failed: close through the peak stop

## Worked example

Peaks 108 / 108.4, trough 100, close 99.7 detects short.

**Inputs**

| | |
| --- | --- |
| Peak 1 | 108 |
| Trough | 100 |
| Peak 2 | 108.4 |
| Break close | 99.7 |

**Steps**

- H2 confirmed; first close below 100 is 99.7 → Detected short.
- Low reaches the projected height below the trough → Succeeded.

**Result:** Succeeded double_top at the measured move.

## Scenarios

### M breaks the trough and reaches the measured move

Peaks 108 / 108.4, trough 100, close 99.7 detects short.

**Setup**

| | |
| --- | --- |
| Peak 1 | 108 |
| Trough | 100 |
| Peak 2 | 108.4 |
| Break close | 99.7 |

**Steps**

- H2 confirmed; first close below 100 is 99.7 → Detected short.
- Low reaches the projected height below the trough → Succeeded.

**Rules**

- Stop / invalidation: a closed bar that reclaims the stop ends the setup as Failed.
- Target: when price reaches the downside target (low for shorts), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in the short direction (price falling) while open, ÷ ATR at detect.
- MAE (R): worst move against the short (price rising) while open, ÷ ATR at detect.
- Both are recorded on success and fail — not “win-only” or “loss-only” metrics.

**Result:** Succeeded double_top at the measured move.

### Break then reclaim through the peak stop

Detect short, later close above the higher peak fails.

**Setup**

| | |
| --- | --- |
| Entry | 99.7 |
| Stop | above higher peak |

**Steps**

- Close above the structural stop → Failed.

**Result:** Failed double_top.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| confirmation_mode | close | `double.confirmation_mode` |  |
| detector_version | double-v1 | `double.detector_version` |  |
| enable_bottom | true | `double.enable_bottom` |  |
| enable_top | true | `double.enable_top` |  |
| enabled | true | `double.enabled` |  |
| fractal_width | 2 | `double.fractal_width` |  |
| log_rejects | false | `double.log_rejects` |  |
| lookback_candles | 80 | `double.lookback_candles` |  |
| max_candles_after_detect | 40 | `double.max_candles_after_detect` |  |
| max_height_atr | 8 | `double.max_height_atr` |  |
| max_pivot_separation | 50 | `double.max_pivot_separation` |  |
| max_second_deeper_atr | 0.25 | `double.max_second_deeper_atr` |  |
| measured_move_frac | 1 | `double.measured_move_frac` |  |
| min_height_atr | 1 | `double.min_height_atr` |  |
| min_pivot_separation | 5 | `double.min_pivot_separation` |  |
| retest_atr_mult | 0.25 | `double.retest_atr_mult` |  |
| stop_buffer_atr | 0.15 | `double.stop_buffer_atr` |  |
| strengthen_atr_mult | 1 | `double.strengthen_atr_mult` |  |
| success_atr_mult | 1.5 | `double.success_atr_mult` |  |
| target_mode | measured | `double.target_mode` |  |
| trough_tolerance_atr | 0.35 | `double.trough_tolerance_atr` |  |
| volume_avg_period | 20 | `double.volume_avg_period` |  |
| volume_multiplier | 1.5 | `double.volume_multiplier` |  |
| atr_period | 14 | `atr_period` | ATR length used as the R unit |

## Flags

- Plotted on chart: yes
- Closed candle only: yes
- Pattern type id: `double_top`
- Detector version hint: double-v1

## Related

- [Double bottom](./double_bottom.md) (`pattern/double_bottom`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Double Top Reversal](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/double-top-reversal) — M geometry; not complete until the intervening trough breaks; measured-move target
- [Bulkowski — Adam and Eve double tops](https://thepatternsite.com/AdamEvePatterns.html) — Encyclopedia of Chart Patterns identification
- [Investopedia — Double Top](https://www.investopedia.com/terms/d/doubletop.asp)

**Docs**

- `docs/patterns/double-top.md`

**Code**

- `backend/app/patterns/double.py`
- `backend/app/patterns/geometry.py`

*Last reviewed: 2026-08-27*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Head and shoulders

> **Kind:** pattern · **Slug:** `head_shoulders` · **Group:** structure · **Direction:** short
>
> SPA: /learn/patterns/head_shoulders  
> Markdown: /learn-export/patterns/head_shoulders.md

Shoulder–head–shoulder; short on a close through the (possibly sloped) neckline.

---

## Plain English

- Head and shoulders is a topping pattern: left shoulder, higher head, right shoulder, then a close through the neckline that joins the two armpits.
- TIP requires those five points to be confirmed fractals. A wick through the neckline does not count.
- After detect, lifecycle uses the frozen neckline price at the break — the slope is only for finding the break and drawing the overlay. Stop is beyond the right shoulder, not the head.

## Questions this answers

- When did a classical measured-move pattern actually trigger (close through the line)?
- Did the virtual trade hit the measured target, the structural stop, or expire?

## How to use it in TIP

- Research default maxRiskR=1.5 hides many of these (structural stops are wide). Use the Classical measured-move preset or raise maxRiskR.
- A close back through the neckline/peak that does not pierce the stop keeps the family slot until stop, target, or session expiry.

## How TIP calculates it

- Walk confirmed pivot highs as LS / head / RS; armpits are the lowest confirmed pivot lows in each interval.
- Rank candidates by head-to-neckline height, then newest right shoulder.
- Freeze neckline-at-break into reference_level.

## Formula (plain)

Five confirmed swings: left shoulder, armpit, higher head, armpit, right shoulder. Detected on the first close below the neckline through the two armpits.

## Formula (formal)

```
neck_i = A + (B−A)×(i−A.index)/(B.index−A.index)
Detected when first close < neck_i after RS is confirmed.
reference_level = neck at the break bar (frozen horizontal).
```

## Lifecycle

- Detected: first close below the interpolated neckline
- Confirmed / retested / strengthened vs the frozen neckline
- Succeeded: low reaches measured move (head-to-neckline height)
- Failed: close above the right-shoulder stop

## Worked example

LS 110, head 116, RS 109.5, armpits 104 / 103.5. Close through the sloped neckline detects short.

**Inputs**

| | |
| --- | --- |
| LS / Head / RS | 110 / 116 / 109.5 |
| Armpits | 104 / 103.5 |
| Stop | beyond RS |

**Steps**

- RS confirmed; first close below interpolated neckline detects short.
- Measured height (head to neckline at the head) projected down is the target.

**Result:** Succeeded head_shoulders at the measured move.

## Scenarios

### Neckline break and measured move

LS 110, head 116, RS 109.5, armpits 104 / 103.5. Close through the sloped neckline detects short.

**Setup**

| | |
| --- | --- |
| LS / Head / RS | 110 / 116 / 109.5 |
| Armpits | 104 / 103.5 |
| Stop | beyond RS |

**Steps**

- RS confirmed; first close below interpolated neckline detects short.
- Measured height (head to neckline at the head) projected down is the target.

**Rules**

- Stop / invalidation: a closed bar that reclaims the stop ends the setup as Failed.
- Target: when price reaches the downside target (low for shorts), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in the short direction (price falling) while open, ÷ ATR at detect.
- MAE (R): worst move against the short (price rising) while open, ÷ ATR at detect.
- Both are recorded on success and fail — not “win-only” or “loss-only” metrics.

**Result:** Succeeded head_shoulders at the measured move.

### Neckline reclaim occupies the slot; stop is the right shoulder

A close back above the frozen neckline does not fail v1. Fail is a close above the right-shoulder stop.

**Setup**

| | |
| --- | --- |
| Invalidation | close > RS + buffer |
| Occupancy | close back above neckline, still below stop |

**Steps**

- False break that reclaims the neckline keeps the instance open.
- No second H&S can detect on that symbol×TF until this one ends.

**Result:** Failed only if the right-shoulder stop is closed through.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| allow_sloping_neckline | true | `head_shoulders.allow_sloping_neckline` |  |
| confirmation_mode | close | `head_shoulders.confirmation_mode` |  |
| detector_version | hs-v1 | `head_shoulders.detector_version` |  |
| enable_inverse | true | `head_shoulders.enable_inverse` |  |
| enable_regular | true | `head_shoulders.enable_regular` |  |
| enabled | true | `head_shoulders.enabled` |  |
| fractal_width | 2 | `head_shoulders.fractal_width` |  |
| log_rejects | false | `head_shoulders.log_rejects` |  |
| lookback_candles | 100 | `head_shoulders.lookback_candles` |  |
| max_candles_after_detect | 50 | `head_shoulders.max_candles_after_detect` |  |
| max_neckline_slope_atr_per_bar | 0.2 | `head_shoulders.max_neckline_slope_atr_per_bar` |  |
| max_span_bars | 70 | `head_shoulders.max_span_bars` |  |
| max_time_asymmetry | 2.5 | `head_shoulders.max_time_asymmetry` |  |
| measured_move_frac | 1 | `head_shoulders.measured_move_frac` |  |
| min_head_prominence_atr | 0.5 | `head_shoulders.min_head_prominence_atr` |  |
| min_span_bars | 8 | `head_shoulders.min_span_bars` |  |
| retest_atr_mult | 0.25 | `head_shoulders.retest_atr_mult` |  |
| shoulder_tolerance_atr | 0.6 | `head_shoulders.shoulder_tolerance_atr` |  |
| stop_buffer_atr | 0.15 | `head_shoulders.stop_buffer_atr` |  |
| strengthen_atr_mult | 1 | `head_shoulders.strengthen_atr_mult` |  |
| success_atr_mult | 1.5 | `head_shoulders.success_atr_mult` |  |
| target_mode | measured | `head_shoulders.target_mode` |  |
| volume_avg_period | 20 | `head_shoulders.volume_avg_period` |  |
| volume_multiplier | 1.5 | `head_shoulders.volume_multiplier` |  |
| atr_period | 14 | `atr_period` | ATR length used as the R unit |

## Flags

- Plotted on chart: yes
- Closed candle only: yes
- Pattern type id: `head_shoulders`
- Detector version hint: hs-v1

## Related

- [Inverse H&S](./inverse_head_shoulders.md) (`pattern/inverse_head_shoulders`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Head and Shoulders Top](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/head-and-shoulders-top) — LS–head–RS + neckline; sloping neckline allowed; height projected from the break
- [Bulkowski — Head-and-Shoulders Tops](https://thepatternsite.com/hst.html) — Confirms on a close through the neckline (or right armpit when the neckline slopes down)
- [Investopedia — Head and Shoulders](https://www.investopedia.com/terms/h/head-shoulders.asp)

**Docs**

- `docs/patterns/head-shoulders.md`

**Code**

- `backend/app/patterns/head_shoulders.py`
- `backend/app/patterns/geometry.py`

*Last reviewed: 2026-08-27*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

# Inverse head and shoulders

> **Kind:** pattern · **Slug:** `inverse_head_shoulders` · **Group:** structure · **Direction:** long
>
> SPA: /learn/patterns/inverse_head_shoulders  
> Markdown: /learn-export/patterns/inverse_head_shoulders.md

Inverted H&S; long on a close through the neckline joining the two armpit highs.

---

## Plain English

- Inverse head and shoulders is the bullish twin: two shoulders around a lower head, then a close above the neckline.
- Same geometry engine as regular H&S via signed candles. A 3-trough inverse can also qualify as a double bottom — both may fire.

## Questions this answers

- When did a classical measured-move pattern actually trigger (close through the line)?
- Did the virtual trade hit the measured target, the structural stop, or expire?

## How to use it in TIP

- Research default maxRiskR=1.5 hides many of these (structural stops are wide). Use the Classical measured-move preset or raise maxRiskR.
- A close back through the neckline/peak that does not pierce the stop keeps the family slot until stop, target, or session expiry.

## How TIP calculates it

- Run the H&S scanner on negated candles; convert rails back to market prices.
- Worked numbers (ATR 2): LS 100, A 106, H 94, B 105.5, RS 100.4. Neck at bar 36 ≈ 105.083. Close 105.50 detects. Stop 100.10. Target 116.833.

## Formula (plain)

Five confirmed swings with the head as the lowest low. Detected on the first close above the neckline.

## Formula (formal)

```
sign=−1 on the H&S engine.
Prominence = min(LS,RS) − H.
Stop = RS low − buffer. Target = neckline_at_break + height.
```

## Lifecycle

- Detected: first close above the interpolated neckline
- Succeeded: high reaches measured target
- Failed: close below the right-shoulder low stop

## Worked example

LS 100, head 94, RS 100.4. Close 105.50 through n_36=105.083 detects long.

**Inputs**

| | |
| --- | --- |
| LS / Head / RS | 100 / 94 / 100.4 |
| Armpits | 106 / 105.5 |
| n_36 | 105.083 |
| Entry | 105.50 |
| Stop | 100.10 |
| Target | 116.833 |

**Steps**

- Prominence min(100,100.4)−94 = 6 = 3 ATR.
- First close above interpolated neckline detects long.
- Target is neckline-at-break + head-to-neckline height.

**Result:** Succeeded inverse_head_shoulders at 116.833.

## Scenarios

### Inverse neckline break

LS 100, head 94, RS 100.4. Close 105.50 through n_36=105.083 detects long.

**Setup**

| | |
| --- | --- |
| LS / Head / RS | 100 / 94 / 100.4 |
| Armpits | 106 / 105.5 |
| n_36 | 105.083 |
| Entry | 105.50 |
| Stop | 100.10 |
| Target | 116.833 |

**Steps**

- Prominence min(100,100.4)−94 = 6 = 3 ATR.
- First close above interpolated neckline detects long.
- Target is neckline-at-break + head-to-neckline height.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Succeeded inverse_head_shoulders at 116.833.

### Close through the right-shoulder stop

Wick below the neckline with close still above it does not detect. After detect, fail is a close below 100.10.

**Setup**

| | |
| --- | --- |
| Stop | 100.10 |
| Wick-only | no detect |

**Steps**

- Wick through neckline, close ≤ neckline → no detect.
- After detect, close 99.9 < 100.10 → Failed.

**Result:** Failed inverse H&S at the structural stop.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| allow_sloping_neckline | true | `head_shoulders.allow_sloping_neckline` |  |
| confirmation_mode | close | `head_shoulders.confirmation_mode` |  |
| detector_version | hs-v1 | `head_shoulders.detector_version` |  |
| enable_inverse | true | `head_shoulders.enable_inverse` |  |
| enable_regular | true | `head_shoulders.enable_regular` |  |
| enabled | true | `head_shoulders.enabled` |  |
| fractal_width | 2 | `head_shoulders.fractal_width` |  |
| log_rejects | false | `head_shoulders.log_rejects` |  |
| lookback_candles | 100 | `head_shoulders.lookback_candles` |  |
| max_candles_after_detect | 50 | `head_shoulders.max_candles_after_detect` |  |
| max_neckline_slope_atr_per_bar | 0.2 | `head_shoulders.max_neckline_slope_atr_per_bar` |  |
| max_span_bars | 70 | `head_shoulders.max_span_bars` |  |
| max_time_asymmetry | 2.5 | `head_shoulders.max_time_asymmetry` |  |
| measured_move_frac | 1 | `head_shoulders.measured_move_frac` |  |
| min_head_prominence_atr | 0.5 | `head_shoulders.min_head_prominence_atr` |  |
| min_span_bars | 8 | `head_shoulders.min_span_bars` |  |
| retest_atr_mult | 0.25 | `head_shoulders.retest_atr_mult` |  |
| shoulder_tolerance_atr | 0.6 | `head_shoulders.shoulder_tolerance_atr` |  |
| stop_buffer_atr | 0.15 | `head_shoulders.stop_buffer_atr` |  |
| strengthen_atr_mult | 1 | `head_shoulders.strengthen_atr_mult` |  |
| success_atr_mult | 1.5 | `head_shoulders.success_atr_mult` |  |
| target_mode | measured | `head_shoulders.target_mode` |  |
| volume_avg_period | 20 | `head_shoulders.volume_avg_period` |  |
| volume_multiplier | 1.5 | `head_shoulders.volume_multiplier` |  |
| atr_period | 14 | `atr_period` | ATR length used as the R unit |

## Flags

- Plotted on chart: yes
- Closed candle only: yes
- Pattern type id: `inverse_head_shoulders`
- Detector version hint: hs-v1

## Related

- [Head and shoulders](./head_shoulders.md) (`pattern/head_shoulders`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Head and Shoulders Bottom](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/head-and-shoulders-bottom) — Inverted H&S; neckline through reaction highs; measured-move target
- [Bulkowski — Head-and-Shoulders Bottoms](https://thepatternsite.com/hsb.html) — Encyclopedia of Chart Patterns identification
- [Investopedia — Inverse Head and Shoulders](https://www.investopedia.com/terms/i/inverseheadandshoulders.asp)

**Docs**

- `docs/patterns/inverse-head-shoulders.md`

**Code**

- `backend/app/patterns/head_shoulders.py`
- `backend/app/patterns/geometry.py`

*Last reviewed: 2026-08-27*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

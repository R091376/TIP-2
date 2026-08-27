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

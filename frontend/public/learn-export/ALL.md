# TIP Learn — complete export

Generated from the TIP frontend Learn catalog (14 topics).

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

When Breakout detects, it freezes atr_at_detect. That single number drives retest distance, strengthen distance, the no-retest target, and R for MFE/MAE.

**Setup**

| | |
| --- | --- |
| Example frozen ATR | 2 |
| Breakout reference | 100 |
| No-retest target | 100 + 2×2 = 104 |
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

**Docs**

- `docs/indicators/volume-sma-20.md`

**Code**

- `backend/app/indicators/volume_sma.py`
- `frontend/src/chart/helpers.js`

*Last reviewed: 2026-08-04*

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
- TIP then watches whether volume and/or later closes confirm the move, whether price retests the breakout level, and whether a virtual long reaches a target or fails.
- This is a long-only setup. Everything runs on closed candles only (no mid-bar repaint).

## How TIP calculates it

- On each closed bar, compute the prior Donchian high over 20 bars before this bar.
- If close > that reference, ATR is available, and anti-spam allows it, emit Detected and freeze the reference.
- Confirmation (default both): detect-bar volume ≥ 1.5 × prior volume SMA, and a later bar still closes above reference.
- Retest: a later low comes within 0.25×ATR of reference without closing below it.
- Strengthen: price extends about 1×ATR beyond reference.
- Succeeded: price reaches the target (retest-based or 2×ATR without retest). Failed: close back below reference.

## Formula (plain)

Reference = max high of the prior 20 bars. Detected when close > reference. Target with retest uses about 2× the risk from retest floor; without retest, about 2×ATR above reference.

## Formula (formal)

```
reference = max(high_{t−20} … high_{t−1})
Detected when close_t > reference (ATR available)
volume ok: vol_t ≥ 1.5 × prior_SMA20(volume)
retest: low ≤ reference + 0.25×ATR and close ≥ reference
target (no retest) ≈ reference + 2×ATR
```

## Lifecycle

- Detected: close above prior 20-high; reference frozen
- Confirmed: volume and/or later close still above reference (mode-dependent)
- Retested: dip near reference without closing below
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
| No-retest target | 100 + 2×2 = 104 |

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

### Optional: retest can rewrite the target

After confirm, if price dips into the retest band near the reference without closing below it, TIP may set a measured target from the retest floor.

**Setup**

| | |
| --- | --- |
| Reference | 100 |
| ATR | 2 |
| Retest band (0.25×ATR) | 100 + 0.5 = up to 100.5 zone |
| Example retest floor (low) | 99.5 (still close ≥ 100) |
| Risk | 100 − 99.5 = 0.5 |
| New target (success_rr = 2) | 100 + 2×0.5 = 101 |

**Steps**

- Initial no-retest target was 104; after a valid retest with floor under reference, target becomes reference + 2× risk.
- MFE/MAE continue updating from highs/lows independently of that rewrite.
- Success still means price reaches whatever the current target is.

**Result:** Retest changes the success rule (target), not the definition of MFE/MAE.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| lookback_candles | 20 | `breakout.lookback_candles` | Bars in the prior high window (excludes signal bar) |
| volume_avg_period | 20 | `breakout.volume_avg_period` | Bars in prior volume average |
| confirmation_mode | both | `breakout.confirmation_mode` | volume \| close \| both \| close_fallback |
| volume_multiplier | 1.5 | `breakout.volume_multiplier` | Detect volume must be ≥ this × prior SMA |
| retest_atr_mult | 0.25 | `breakout.retest_atr_mult` | How close a dip to reference counts as retest |
| strengthen_atr_mult | 1 | `breakout.strengthen_atr_mult` | Extension beyond reference for Strengthened |
| success_rr | 2 | `breakout.success_rr` | Reward multiple vs risk after retest |
| success_atr_mult_without_retest | 2 | `breakout.success_atr_mult_without_retest` | Target distance in ATR if no retest |
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

## Sources

**Docs**

- `docs/patterns/breakout.md`

**Code**

- `backend/app/patterns/breakout.py`

*Last reviewed: 2026-08-04*

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
- TIP tracks confirmation, retest of the floor from below, extension, and virtual short success/fail the same way as breakout, but mirrored.
- Closed candles only; reference is frozen at detect.

## How TIP calculates it

- Compute prior Donchian low over 20 bars before the signal bar.
- Detected when close < that reference (ATR available, anti-spam OK).
- Confirmation mirrors breakout: volume and/or later close still below reference.
- Retest: high comes within 0.25×ATR of reference without closing back above it.
- Succeeded toward a downside target; Failed if close returns above reference.

## Formula (plain)

Reference = min low of the prior 20 bars. Detected when close < reference. Targets and retests use ATR multiples like breakout, flipped for shorts.

## Formula (formal)

```
reference = min(low_{t−20} … low_{t−1})
Detected when close_t < reference
retest: high ≥ reference − 0.25×ATR and close ≤ reference
```

## Lifecycle

- Detected: close below prior 20-low
- Confirmed: volume and/or later close still below reference
- Retested: bounce near floor without reclaim
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
| No-retest target | 50 − 2×2 = 46 |

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
| retest_atr_mult | 0.25 | `breakdown.retest_atr_mult` | Retest band in ATR |
| strengthen_atr_mult | 1 | `breakdown.strengthen_atr_mult` | Extension multiple for Strengthened |
| success_rr | 2 | `breakdown.success_rr` | Reward multiple after retest |
| success_atr_mult_without_retest | 2 | `breakdown.success_atr_mult_without_retest` | Target in ATR without retest |
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

**Docs**

- `docs/patterns/breakdown.md`

**Code**

- `backend/app/patterns/breakdown.py`

*Last reviewed: 2026-08-04*

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

## Sources

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

**Docs**

- `docs/patterns/hh-ll.md`

**Code**

- `backend/app/patterns/structure.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*


---

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

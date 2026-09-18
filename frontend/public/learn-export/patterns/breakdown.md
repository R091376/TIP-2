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

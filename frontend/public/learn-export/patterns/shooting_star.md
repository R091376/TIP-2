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

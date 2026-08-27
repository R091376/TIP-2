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

**Docs**

- `docs/patterns/inverse-head-shoulders.md`

**Code**

- `backend/app/patterns/head_shoulders.py`
- `backend/app/patterns/geometry.py`

*Last reviewed: 2026-08-27*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*

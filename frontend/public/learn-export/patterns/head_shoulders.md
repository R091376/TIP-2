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

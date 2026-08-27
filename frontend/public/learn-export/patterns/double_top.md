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

**Docs**

- `docs/patterns/double-top.md`

**Code**

- `backend/app/patterns/double.py`
- `backend/app/patterns/geometry.py`

*Last reviewed: 2026-08-27*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*

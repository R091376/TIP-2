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

**Docs**

- `docs/patterns/double-bottom.md`

**Code**

- `backend/app/patterns/double.py`
- `backend/app/patterns/geometry.py`

*Last reviewed: 2026-08-27*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*

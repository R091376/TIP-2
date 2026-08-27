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

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

**Textbook / online**

- [StockCharts ChartSchool — Engulfing Pattern](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary#engulfing_pattern) — Body engulfs prior body (not necessarily the full high–low range)
- [StockCharts ChartSchool — Bearish reversal candlesticks](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-bearish-reversal-patterns)
- [Investopedia — Bearish Engulfing](https://www.investopedia.com/terms/b/bearishengulfingp.asp)

**Docs**

- `docs/patterns/engulfing.md`

**Code**

- `backend/app/patterns/engulfing.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*

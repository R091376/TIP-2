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

**Textbook / online**

- [StockCharts ChartSchool — Engulfing Pattern](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary#engulfing_pattern) — Body engulfs prior body (not necessarily the full high–low range)
- [StockCharts ChartSchool — Bullish reversal candlesticks](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-bullish-reversal-patterns)
- [Investopedia — Bullish Engulfing](https://www.investopedia.com/terms/b/bullishengulfingpattern.asp)

**Docs**

- `docs/patterns/engulfing.md`

**Code**

- `backend/app/patterns/engulfing.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*

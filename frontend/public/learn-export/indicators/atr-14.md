# ATR (14)

> **Kind:** indicator · **Slug:** `atr-14` · **Group:** indicator
>
> SPA: /learn/indicators/atr-14  
> Markdown: /learn-export/indicators/atr-14.md

How big is a normal candle move? TIP’s volatility yardstick.

---

## Plain English

- ATR means Average True Range. It answers: “How large is a typical move for this symbol on this timeframe?”
- TIP plots Wilder ATR(14) in its own pane under price (amber line), computed on the chart from the same candles. Pattern detectors use the same formula for retest bands, targets, and the R-unit.
- True range also counts gaps: a bar that opens far from yesterday’s close still counts as a big move.

## How TIP calculates it

- For each closed bar, compute true range (TR): the largest of (high−low), |high−prior close|, |low−prior close|.
- After enough bars, take the simple average of the first 14 true ranges — that is the first ATR.
- For each new bar, smooth with Wilder’s method: blend the previous ATR with the new TR.
- If fewer than 15 closed bars (14 TR values need a prior close), ATR is unavailable and patterns that need it will not open.

## Formula (plain)

First ATR is the average of 14 true ranges. Later ATR values = (previous ATR × 13 + new true range) ÷ 14.

## Formula (formal)

```
TR_i = max(high_i − low_i, |high_i − close_{i−1}|, |low_i − close_{i−1}|)
ATR_first = mean(TR_1 … TR_14)
ATR_t = (ATR_{t−1} × 13 + TR_t) / 14
```

## Worked example

Toy series with period 3 so you can see the steps. TIP production uses period 14 with the same method. Patterns freeze ATR at detect as the R-unit.

*Example uses N=3; TIP uses 14.*

**Inputs**

| | |
| --- | --- |
| Bar 1 close | 100 |
| Bar 2 H/L/C | 105 / 99 / 103 |
| Bar 3 H/L/C | 104 / 100 / 101 |
| Bar 4 H/L/C | 108 / 102 / 107 |

**Steps**

- TR2 = max(105−99, |105−100|, |99−100|) = 6
- TR3 = max(104−100, |104−103|, |100−103|) = 4
- TR4 = max(108−102, |108−101|, |102−101|) = 7
- First ATR (N=3) = (6+4+7)/3 = 5.67

**Result:** TIP would report ATR ≈ 5.67 after the first full toy window. With N=14 it waits for more bars, then uses Wilder smoothing the same way.

## Scenarios

### Compute ATR (toy N=3)

ATR is not a buy/sell signal. It is a size ruler. We use a tiny period so the arithmetic is obvious.

**Setup**

| | |
| --- | --- |
| Prior close (bar 1) | 100 |
| Bar 2 H/L/C | 105 / 99 / 103 |
| Bar 3 H/L/C | 104 / 100 / 101 |
| Bar 4 H/L/C | 108 / 102 / 107 |

**Timeline**

- Bar 2 · OHLC H 105 / L 99 / C 103 · — TR = max(6, 5, 1) = 6 (includes gap vs prior close 100).
- Bar 3 · OHLC H 104 / L 100 / C 101 · — TR = max(4, 1, 3) = 4.
- Bar 4 · OHLC H 108 / L 102 / C 107 · — TR = max(6, 7, 1) = 7. First ATR = mean(6,4,7) = 5.67.

**After first ATR**

| Metric | Value |
| --- | --- |
| ATR | ≈ 5.67 |
| If next TR = 3 | ATR = (5.67×2 + 3)/3 ≈ 4.78 |

**Steps**

- True range takes the largest of bar height and gap distances to prior close.
- First ATR averages the first N true ranges.
- Later bars use Wilder smoothing so ATR changes gradually.

**Result:** With enough bars, TIP always has an ATR number patterns can freeze at detect.

### How patterns use ATR

When Breakout detects, it freezes atr_at_detect. That single number drives retest distance, strengthen distance, the frozen target, and R for MFE/MAE.

**Setup**

| | |
| --- | --- |
| Example frozen ATR | 2 |
| Breakout reference | 100 |
| Target | 100 + 2×2 = 104 |
| Retest band (0.25×ATR) | within 0.5 of reference |
| If entry 101 and best high 104.3 | MFE(R) = (104.3−101)/2 = 1.65 R |

**Steps**

- ATR answers “how big is normal?” so a ₹2 stock and a ₹2000 stock can share the same R language.
- Patterns that need ATR will not open while ATR is still warming up.
- Open the Breakout Learn page for a full trade timeline using ATR = 2.

**Result:** ATR itself does not detect breakouts — breakout/breakdown/pinbars/etc. consume ATR as a yardstick.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| period | 14 | `indicators.atr.period` | Default Wilder period (AtrIndicator.DEFAULT_PERIOD) |
| atr_period | 14 | `atr_period` | Settings field used by pattern detectors for ATR length |

## Flags

- Plotted on chart: yes
- Closed candle only: yes

## Related

- [Donchian (20)](./donchian-20.md) (`indicator/donchian-20`)
- [Breakout](./../patterns/breakout.md) (`pattern/breakout`)
- [Breakdown](./../patterns/breakdown.md) (`pattern/breakdown`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Average True Range (ATR)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/average-true-range-atr) — Wilder 1978; TR = max(H−L, |H−prior C|, |L−prior C|); default period 14; Wilder smoothing
- [Investopedia — Average True Range (ATR)](https://www.investopedia.com/terms/a/atr.asp)

**Docs**

- `docs/indicators/atr-14.md`

**Code**

- `backend/app/indicators/atr.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*

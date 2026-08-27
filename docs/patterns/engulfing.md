# Patterns: Bullish / Bearish Engulfing

| Field | Value |
|---|---|
| **Types** | `bullish_engulfing` (long), `bearish_engulfing` (short) |
| **Code** | `com.tip.patterns.engulfing` |
| **Status** | Implemented |
| **Sources** | Steve Nison, *Japanese Candlestick Charting Techniques* (engulfing pattern); Thomas Bulkowski (body engulf + confirmation); [StockCharts ChartSchool — Engulfing](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary#engulfing_pattern) |

## Geometry (closed bars only)

Prior bar = \(t-1\), signal = \(t\).

### Bullish engulfing

- Prior bearish: \(close_{t-1} < open_{t-1}\)
- Signal bullish: \(close_t > open_t\)
- Body engulfs prior body: \(open_t \le close_{t-1}\) and \(close_t \ge open_{t-1}\)
- \(range_t \ge minRangeAtrMult \times ATR(14)\)

### Bearish engulfing

Mirror (prior bullish, signal bearish, body engulfs).

## Lifecycle

Detected → Confirmed (later close beyond signal high/low) → Succeeded (1.5×ATR) | Failed (close beyond stop).

| | Long | Short |
|---|---|---|
| Stop | \(\min(low_t, low_{t-1})\) | \(\max(high_t, high_{t-1})\) |
| Confirm | close > signal high | close < signal low |
| Target | entry + 1.5×ATR | entry − 1.5×ATR |

Anti-spam: at most one open engulfing of either type per symbol×TF.

## Trusted-source geometry

| Rule | Source | TIP v1 |
|---|---|---|
| Second body completely covers the first body | Nison; ChartSchool dictionary (not the full high–low range) | `open_t ≤ close_{t-1}` and `close_t ≥ open_{t-1}` (bullish; mirrored for bearish) |
| Opposite color / direction | Nison; ChartSchool | Prior bearish + signal bullish (or reverse) |
| Confirmation on a later close | Bulkowski | Confirmed when a later close exceeds the signal high/low |
| Prior trend required | Nison (reversal context) | **Not required** — geometry only |

## Online sources

- [StockCharts ChartSchool — Engulfing Pattern](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-pattern-dictionary#engulfing_pattern)
- [StockCharts ChartSchool — Bullish reversal candlesticks](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/candlestick-charts/candlestick-bullish-reversal-patterns)
- [Investopedia — Bullish Engulfing](https://www.investopedia.com/terms/b/bullishengulfingpattern.asp)
- [Investopedia — Bearish Engulfing](https://www.investopedia.com/terms/b/bearishengulfingp.asp)

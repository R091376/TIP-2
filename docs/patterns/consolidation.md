# Pattern: Consolidation (volatility compression)

| Field | Value |
|---|---|
| **Type** | `consolidation` |
| **Code** | `com.tip.patterns.consolidation` |
| **Status** | Implemented |
| **Sources** | John Murphy, *Technical Analysis of the Financial Markets* (congestion / trading ranges, expansion after contraction); [StockCharts ChartSchool — Rectangle](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/rectangle); related: [Bollinger Band Squeeze](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/bollinger-band-squeeze), [NR7](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7) |

## Why it adds value

| Already have | Consolidation adds |
|---|---|
| Inside bar (1 mother bar) | **Multi-bar** tight range (M candles) |
| Breakout (Donchian 20) | **Context**: compression *before* expansion; can fire without a 20-bar high |
| HH/LL structure | Range **bound** levels for stops / focus |

It is a **regime** signal (low range vs ATR), not a one-bar candlestick. Useful as “wait for expansion” and for journal stats on how ranges resolve.

## Geometry (closed bars only)

Window \(M = 10\) (config). Over last \(M\) closed candles:

\[
R = \max(high) - \min(low), \quad \text{tight if } R \le \kappa \times ATR(14),\ \kappa = 1.5
\]

**Detected** when the latest window is tight (first bar the condition becomes true, or re-detect after prior instance closed).

Frozen at detect:

| Field | Value |
|---|---|
| `lookbackHigh` | range high |
| `referenceLevel` / `stopLevel` | range low (structure floor) |
| `entryPrice` | mid = \((high+low)/2\) of range |
| `targetLevel` | not a directional target at detect — updated on expansion (see Succeeded) |
| `direction` | `long` placeholder until expansion (wire schema); expansion side is in terminal reason / price |

## Lifecycle (pragmatic vs full linked breakout)

Full MVP doc wanted Succeeded only via linked Breakout/Breakdown instance. **Implemented simplification** (no extra schema link):

| Stage | Rule |
|---|---|
| **Detected** | Tight window as above; ATR available; no other open consolidation on series |
| **Strengthened** (once) | Still tight and \(R_{now} \le 0.85 \times R_{detect}\), or duration ≥ \(1.5M\) still tight |
| **Succeeded** | Close **above** range high **or** **below** range low (expansion). Terminal. |
| **Failed** | Still inside range after **maxDurationCandles** (default 30) |
| **Expired** | Session / global expiry policies |

No Retested / Confirmed required (flags stay false unless strengthened).

## Config (`tip.pattern.consolidation.*`)

| Key | Default |
|---|---|
| `window-candles` | 10 |
| `range-atr-mult` | 1.5 |
| `max-duration-candles` | 30 |
| `tighten-ratio` | 0.85 |
| `detector-version` | consolidation-v1 |

## Trusted-source geometry

| Rule | Source | TIP v1 |
|---|---|---|
| Multi-bar congestion / trading range | Murphy; ChartSchool Rectangle | Window of M closed bars whose range is small vs ATR |
| Compression precedes expansion | ChartSchool Bollinger Squeeze; NR7 | Regime flag, not a Bollinger/%B or NR7 detector |
| Break of the range is the trade | Rectangle | TIP journals the **compression itself**; expansion is Succeeded/Failed vs ATR, not a Donchian break |

## Online sources

- [StockCharts ChartSchool — Rectangle](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/rectangle)
- [StockCharts ChartSchool — Bollinger Band Squeeze](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/bollinger-band-squeeze)
- [StockCharts ChartSchool — Narrow Range Day (NR7)](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7)

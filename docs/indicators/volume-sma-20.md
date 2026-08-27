# Indicator: Volume SMA(20)

| Field | Value |
|---|---|
| **Name** | Simple moving average of volume |
| **Period** | 20 (default; config `tip.pattern.breakout.volume-avg-period`) |
| **Code** | `com.tip.indicators.VolumeSmaIndicator` |
| **Status** | Implemented (pure Java) |
| **Sources** | John Murphy (volume confirms price); [StockCharts ChartSchool — SMA](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/moving-averages-simple-and-exponential); [Relative Volume](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-volume-rvol) |

## Purpose

Baseline for Breakout volume confirmation: detect-bar volume must be ≥ `volumeMultiplier × prior SMA(20)` when confirmation mode includes volume.

## Inputs

- Ordered list of **closed** candles (ascending `time`).
- Period `n` (default 20).

## Formula

### Window including last bar

\[
SMA_n = \frac{1}{n}\sum_{i=0}^{n-1} volume_{t-i}
\]

### Prior window (for breakout baseline)

Over the `n` bars **before** the signal bar:

\[
priorSMA_n = \frac{1}{n}\sum volume \text{ of } c_{t-n},\ldots,c_{t-1}
\]

Requires at least `n + 1` closed bars.

## Warmup

| Method | Min bars |
|---|---|
| `average` | `n` |
| `priorAverage` | `n + 1` |

## Edge cases

| Case | Behavior |
|---|---|
| Insufficient bars | Empty optional |
| Zero volumes (indices) | SMA = 0 → volume treated unusable → close_fallback |
| Negative volume | Not expected; stored as long ≥ 0 from engine |

## Related

- Breakout confirmation: `docs/patterns/breakout.md`

## Trusted-source geometry

| Rule | Source | TIP v1 |
|---|---|---|
| Simple average of the last N values | ChartSchool SMA | SMA of volume, period 20 |
| Compare current volume to a lookback average | ChartSchool RVOL | Detect-bar volume ≥ `volume_multiplier × prior SMA` when confirmation includes volume |
| Volume confirms price | Murphy | Optional; indices with unusable volume fall back to close-only |

## Online sources

- [StockCharts ChartSchool — Moving Averages (SMA)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/moving-averages-simple-and-exponential)
- [StockCharts ChartSchool — Relative Volume (RVOL)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-volume-rvol)
- [Investopedia — Volume](https://www.investopedia.com/terms/v/volume.asp)

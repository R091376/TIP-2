# Indicator: ATR(14)

| Field | Value |
|---|---|
| **Name** | Average True Range |
| **Period** | 14 (default; config `tip.pattern.atr-period`) |
| **Code** | `com.tip.indicators.AtrIndicator` |
| **Status** | Implemented (pure Java) |

## Purpose

Volatility yardstick: “how large is a normal move for this series?” Used by Breakout for retest band, strengthen distance, success target without retest, and R-unit for MFE/MAE.

## Inputs

- Ordered list of **closed** candles (`time` ascending): `open, high, low, close, volume`.
- Period `n` (default 14).

## Formula (Wilder)

True range for bar \(i\) (using previous close):

\[
TR_i = \max\bigl(
  high_i - low_i,\;
  |high_i - close_{i-1}|,\;
  |low_i - close_{i-1}|
\bigr)
\]

First ATR (after `n` true ranges, i.e. `n+1` candles):

\[
ATR_n = \frac{1}{n}\sum_{i=1}^{n} TR_i
\]

Subsequent (Wilder smoothing):

\[
ATR_t = \frac{ATR_{t-1}\cdot(n-1) + TR_t}{n}
\]

## Warmup

- Minimum candles: **`n + 1`** (need a previous close for the first TR in the SMA window).
- If fewer bars: return empty / NaN — callers must not open patterns without ATR.

## Edge cases

| Case | Behavior |
|---|---|
| Empty / short series | No value |
| Zero-range bar | TR may still be non-zero vs prior close |
| Gaps | Captured via high/low vs prior close |
| Index candles (volume 0) | ATR still valid (price-only) |

## Units

Same price units as OHLC (e.g. INR). Not a percentage.

## Related

- Breakout: `docs/patterns/breakout.md`
- Design: PI-8 (R = `atr_at_detect`)

# Patterns: Bullish / Bearish Engulfing

| Field | Value |
|---|---|
| **Types** | `bullish_engulfing` (long), `bearish_engulfing` (short) |
| **Code** | `com.tip.patterns.engulfing` |
| **Status** | Implemented |
| **Sources** | Steve Nison, *Japanese Candlestick Charting Techniques* (engulfing pattern); Thomas Bulkowski (body engulf + confirmation) |

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

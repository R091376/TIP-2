# Indicator: Donchian(20) high / low

| Field | Value |
|---|---|
| **Name** | Donchian channel (high / low) |
| **Period** | 20 (default; config `tip.pattern.breakout.lookback-candles`) |
| **Code** | `com.tip.indicators.DonchianIndicator` |
| **Status** | Implemented (pure Java) |

## Purpose

Reference levels for range breakouts: highest high / lowest low over a lookback window of **closed** bars.

## Inputs

- Ordered list of closed candles (ascending `time`).
- Period `n` (default 20).

## Formula

Over a window of `n` candles \(W\):

\[
DonchianHigh_n = \max_{c \in W} high_c
\]

\[
DonchianLow_n = \min_{c \in W} low_c
\]

### Prior window (for breakout / breakdown detection)

For detecting on the **latest** closed bar \(c_t\), the reference level uses the **prior** `n` bars only (excluding \(c_t\)):

\[
refBreakout = \max(high \text{ of } c_{t-n},\ldots,c_{t-1})
\]

\[
refBreakdown = \min(low \text{ of } c_{t-n},\ldots,c_{t-1})
\]

- **Breakout** (`DonchianIndicator.priorHighestHigh`): Detected when \(close_t > refBreakout\).
- **Breakdown** (`DonchianIndicator.priorLowestLow`): Detected when \(close_t < refBreakdown\).

If the current bar were included in the max high, `close > max(high)` would almost never fire (only on flat-top closes). Symmetric for lows. Prior-window is the intentional definition for TIP Breakout / Breakdown.

## Warmup

- Prior high/low: need at least **`n + 1`** closed bars (n prior + signal bar).
- Window on last `n` bars only: need at least **`n`** bars.

## Edge cases

| Case | Behavior |
|---|---|
| Insufficient bars | Empty / no reference |
| Equal highs | Max is well-defined |
| Single spike high | Becomes reference until it rolls out of window |

## Units

Price (same as OHLC).

## Related

- Breakout stages: `docs/patterns/breakout.md`
- Breakdown stages: `docs/patterns/breakdown.md`

# Pattern: Volume Breakout (volume expansion bar)

| Field | Value |
|---|---|
| **Type** | `volume_breakout` |
| **Code** | `com.tip.patterns.volumebreakout` |
| **Status** | Implemented |
| **Sources** | Alexander Elder / classic volume analysis (unusual volume with price commitment); John Murphy (volume confirms price); TIP Pattern-Definitions (2× avg vol + 0.5×ATR move) |

## Why it adds value

| Already have | Volume breakout adds |
|---|---|
| Price Breakout (Donchian + optional vol confirm) | Fires on **volume surge + large bar** even **without** breaking the 20-bar high/low |
| Engulfing / pin bar | Explicit **volume** filter (2× SMA20), not only shape |
| Equities only meaningful | Skips when volume unusable (indices → no detect) |

Independent co-fire with price Breakout/Breakdown is intentional (TIP Option A): one event can legitimately hit both.

## Detect (single closed bar)

Let \(V_{avg}\) = prior SMA of volume over \(P=20\) bars (excluding signal), ATR(14) available.

\[
volOk = volume_t \ge 2.0 \times V_{avg},\quad
moveOk = (high_t - low_t) \ge 0.5 \times ATR
\]

Both required. Direction: \(close \ge open\) → **long**, else **short**.

| Field | Long | Short |
|---|---|---|
| Entry | close | close |
| Stop | low of signal | high of signal |
| Confirm extreme | signal high | signal low |
| Target | entry + 1.5×ATR | entry − 1.5×ATR |

## Lifecycle (short — not full retest stack)

Single-bar climax fits **Detected → Confirmed → Succeeded | Failed** better than full Donchian retest/strengthen.

| Stage | Rule |
|---|---|
| **Detected** | volOk ∧ moveOk; not index/zero volume; one open vol-breakout per series |
| **Confirmed** | Later close beyond signal extreme (high/low) |
| **Succeeded** | Favorable extreme reaches target |
| **Failed** | Close beyond stop |
| **Expired** | max candles / session policies |

## Config (`tip.pattern.volume-breakout.*`)

| Key | Default |
|---|---|
| `volume-avg-period` | 20 |
| `volume-multiplier` | 2.0 |
| `min-range-atr-mult` | 0.5 |
| `success-atr-mult` | 1.5 |
| `max-candles-after-detect` | 20 |
| `detector-version` | volume-breakout-v1 |

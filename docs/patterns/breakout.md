# Pattern: Breakout

| Field | Value |
|---|---|
| **Type** | `breakout` |
| **Direction** | `long` |
| **Code** | `com.tip.patterns.breakout` (`BreakoutDetector`, `BreakoutLifecycle`, `BreakoutBarEvaluator`) |
| **Rules base** | `Pattern-Definitions-v1.0-Final.md` + design divergences (PI-7) |
| **Status** | **Implemented end-to-end** (pure domain + Spring evaluator + journal + REST/WS when Postgres) |

## Purpose

Detect price closing above a prior Donchian high, track confirmation / retest / extension, and journal a virtual long outcome (Succeeded / Failed / Expired) with R-based MFE/MAE.

## Indicators used

| Indicator | Role |
|---|---|
| Donchian prior-20 high | Reference level at Detected (frozen thereafter) |
| ATR(14) | Retest band, strengthen, no-retest target, R unit |
| Volume SMA(20) | Confirmation when mode includes volume |

## Reference at Detected (frozen)

\[
reference = \max(high_{t-20},\ldots,high_{t-1})
\]

Stored on the instance; never recomputed for that setup.

## Virtual trade (read-only)

| Field | Value |
|---|---|
| Entry | Detected bar **close** |
| Stop / invalidation | Close back **below** `reference` |
| R unit | `atr_at_detect` |
| Target (with retest) | \(reference + 2 \times (reference - retest\_floor)\) when \(retest\_floor < reference\) |
| Target (no retest) | \(reference + 2 \times atr\_at\_detect\) (PI-7 product lock) |

## Lifecycle stages

Evaluation is **closed-candle only** (non-repainting).

### DETECTED

| | |
|---|---|
| **Enter** | `close_t > reference` (prior Donchian-20 high), ATR available, and anti-spam: `reference > max(open instances' reference)` for same symbol×TF (or no opens). |
| **Emit** | Event `detected`; open `pattern_instances` row. |
| **Flags** | all false |

### CONFIRMED

| | |
|---|---|
| **Enter** | From DETECTED when confirmation mode passes (not necessarily the next bar only — see modes). |
| **Modes** | `close` / `close_fallback`: a later closed bar (not the detect bar) closes **`> reference`** (still above; equals neither confirms nor fails). `volume`: detect-bar volume `≥ 1.5 × prior SMA20 volume` on the detect bar only. `both` (default): volume ok at detect **and** later close still `> reference`. |
| **Index / zero volume** | Auto-fallback: treat as **close-only** when segment is INDEX or volume unusable (PI-12). |

### RETESTED

| | |
|---|---|
| **Enter** | After DETECTED (typically after CONFIRMED path in practice): a closed bar has `low` within `0.25 × ATR` of `reference` (i.e. `low <= reference + 0.25×ATR`) and **close >= reference** (did not close back below). |
| **Emit** | Once (`flag_retested`). May fire after STRENGTHENED as an event; **display status never demotes** (PI-22). |
| **Side effect** | Set `retest_floor` (min low in retest zone rules); update measured target when floor `< reference`. |

### STRENGTHENED

| | |
|---|---|
| **Enter** | Price extends `>= reference + 1.0 × ATR` (use closed bar high/close per implementation: design uses high/close checks consistent with success) without having failed. |
| **Emit** | Once (`flag_strengthened`). |

### SUCCEEDED (terminal)

| | |
|---|---|
| **Enter** | Closed bar high (or close — implement high for favorable excursion) reaches `target_level`. |
| **Allowed without retest** | Yes — ATR target (PI-7). |
| **Allowed without confirmed** | Yes if target hit first (PI-21 ordering still applies for fail vs succeed). |

### FAILED (terminal)

| | |
|---|---|
| **Enter** | Closed bar **close < reference** after Detected. |
| **Same-bar vs Succeeded** | **Failed wins** if both would fire (PI-21). |

### EXPIRED (terminal)

| TF | Rule |
|---|---|
| `1m`,`5m`,`15m` | Session close (`MarketPhase.CLOSED`) or startup recovery for these TFs |
| `1h` | Like 4h: **not** daily session-expire; hydrate on restart; expire after **5 sessions** or **60 bars** (config) |
| `4h` | 5 sessions or 60 bars (config); hydrate on restart |
| `1d` | 30 daily bars; never session-expire; hydrate on restart |

## Display status (PI-22)

- If terminal: that terminal.
- Else highest ordinal among flags: `STRENGTHENED > RETESTED > CONFIRMED > DETECTED`.
- Status **never demotes**.

## MFE / MAE (R)

While open (memory; recompute on hydrate for multi-day):

- `mfePrice = max(high)` since detect  
- `maePrice = min(low)` since detect  

\[
MFE_R = (mfePrice - entry) / atr\_at\_detect,\quad
MAE_R = (entry - maePrice) / atr\_at\_detect
\]

Written on outcome when known; **NULL** on startup_recovery expire for intraday (exclude from averages).

## Multi-instance

Multiple open breakouts allowed; new Detected only if `ref > max(open.reference_level)`.

## Config keys (see design)

- `tip.pattern.breakout.lookback-candles` (20)
- `tip.pattern.breakout.confirmation-mode` (`both`|`close`|`volume`)
- `tip.pattern.breakout.volume-multiplier` (1.5)
- `tip.pattern.breakout.retest-atr-mult` (0.25)
- `tip.pattern.breakout.strengthen-atr-mult` (1.0)
- `tip.pattern.breakout.success-rr` (2.0)
- `tip.pattern.breakout.success-atr-mult-without-retest` (2.0)

## Related

- `docs/indicators/atr-14.md`, `docs/indicators/donchian-20.md`
- `docs/modules/journal.md`
- `Pattern-Intelligence-Design-v1.0.md`

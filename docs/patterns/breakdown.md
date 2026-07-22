# Pattern: Breakdown

| Field | Value |
|---|---|
| **Type** | `breakdown` |
| **Direction** | `short` |
| **Code** | `com.tip.patterns.breakdown` (`BreakdownDetector`, `BreakdownLifecycle`, `BreakdownBarEvaluator`) |
| **Rules base** | `Pattern-Definitions-v1.0-Final.md` §2 (exact mirror of Breakout) + design divergences (PI-7 etc.) applied symmetrically |
| **Status** | **Implemented end-to-end** (pure domain + Spring evaluator + journal + REST/WS when Postgres) |

## Purpose

Detect price closing below a prior Donchian low, track confirmation / retest / extension, and journal a virtual short outcome (Succeeded / Failed / Expired) with R-based MFE/MAE.

## Indicators used

| Indicator | Role |
|---|---|
| Donchian prior-20 low | Reference level at Detected (frozen thereafter) |
| ATR(14) | Retest band, strengthen, no-retest target, R unit |
| Volume SMA(20) | Confirmation when mode includes volume |

## Reference at Detected (frozen)

\[
reference = \min(low_{t-20},\ldots,low_{t-1})
\]

Stored on the instance (`reference_level` and `lookback_high` column — name is historical; value is the Donchian extreme). Never recomputed for that setup.

## Virtual trade (read-only)

| Field | Value |
|---|---|
| Entry | Detected bar **close** |
| Stop / invalidation | Close back **above** `reference` |
| R unit | `atr_at_detect` |
| Target (with retest) | \(reference - 2 \times (retest\_ceiling - reference)\) when \(retest\_ceiling > reference\) |
| Target (no retest) | \(reference - 2 \times atr\_at\_detect\) (PI-7 product lock, mirrored) |

`retest_floor` DB/domain field stores the retest **ceiling** (max high in retest zone) for shorts.

## Lifecycle stages

Evaluation is **closed-candle only** (non-repainting).

### DETECTED

| | |
|---|---|
| **Enter** | `close_t < reference` (prior Donchian-20 low), ATR available, and anti-spam: `reference < min(open instances' reference)` for same symbol×TF (or no opens). |
| **Emit** | Event `detected`; open `pattern_instances` row. |
| **Flags** | all false |

### CONFIRMED

| | |
|---|---|
| **Enter** | From DETECTED when confirmation mode passes. |
| **Modes** | `close` / `close_fallback`: a later closed bar closes **`< reference`**. `volume`: detect-bar volume `≥ 1.5 × prior SMA20 volume`. `both` (default): volume ok at detect **and** later close still `< reference`. |
| **Index / zero volume** | Auto-fallback: treat as **close-only** when segment is INDEX or volume unusable (PI-12). |

### RETESTED

| | |
|---|---|
| **Enter** | After CONFIRMED: a closed bar has `high` within `0.25 × ATR` of `reference` (i.e. `high >= reference - 0.25×ATR`) and **close ≤ reference** (did not close back above). |
| **Emit** | Once (`flag_retested`). May fire after STRENGTHENED as an event; **display status never demotes** (PI-22). |
| **Side effect** | Set retest extreme (`retest_floor` field = bar high); update measured target when high `> reference`. |

### STRENGTHENED

| | |
|---|---|
| **Enter** | Price extends `<= reference - 1.0 × ATR` (closed bar **low**) without having failed. |
| **Emit** | Once (`flag_strengthened`). |

### SUCCEEDED (terminal)

| | |
|---|---|
| **Enter** | Closed bar **low** reaches `target_level` (price at or below target). |
| **Allowed without retest** | Yes — ATR target (PI-7). |
| **Allowed without confirmed** | Yes if target hit first (PI-21 ordering still applies for fail vs succeed). |

### FAILED (terminal)

| | |
|---|---|
| **Enter** | Closed bar **close > reference** after Detected. |
| **Same-bar vs Succeeded** | **Failed wins** if both would fire (PI-21). |

### EXPIRED (terminal)

Same policy as Breakout (`docs/patterns/breakout.md`): session close for `1m`/`5m`/`15m`; multi-day max sessions/candles for `1h`/`4h`/`1d`.

## Display status (PI-22)

Identical to Breakout: terminal wins; else `STRENGTHENED > RETESTED > CONFIRMED > DETECTED`. Status **never demotes**.

## MFE / MAE (R)

While open, extremes track price:

- `mfePrice = max(high)` since detect  
- `maePrice = min(low)` since detect  

For **SHORT**:

\[
MFE_R = (entry - maePrice) / atr\_at\_detect,\quad
MAE_R = (mfePrice - entry) / atr\_at\_detect,\quad
move_R = (entry - endPrice) / atr\_at\_detect
\]

## Multi-instance

Multiple open breakdowns allowed; new Detected only if `ref < min(open.reference_level)`.

## Config keys

- `tip.pattern.breakdown.lookback-candles` (20)
- `tip.pattern.breakdown.confirmation-mode` (`both`|`close`|`volume`)
- `tip.pattern.breakdown.volume-multiplier` (1.5)
- `tip.pattern.breakdown.retest-atr-mult` (0.25)
- `tip.pattern.breakdown.strengthen-atr-mult` (1.0)
- `tip.pattern.breakdown.success-rr` (2.0)
- `tip.pattern.breakdown.success-atr-mult-without-retest` (2.0)
- `tip.pattern.breakdown.detector-version` (`breakdown-v1`)

Shared: `tip.pattern.atr-period`, expiry, WS broadcast stages.

## Related

- `docs/patterns/breakout.md` (long mirror)
- `docs/indicators/atr-14.md`, `docs/indicators/donchian-20.md`
- `docs/modules/journal.md`
- `Pattern-Intelligence-Design-v1.0.md` PR7

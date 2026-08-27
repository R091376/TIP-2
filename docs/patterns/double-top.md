# Pattern: Double top

| Field | Value |
|---|---|
| **Type** | `double_top` |
| **Direction** | `short` |
| **Code** | Same engine as double bottom (`sign=−1`) |
| **Status** | Implemented |

## Purpose

Two confirmed pivot highs around a trough. Detected on the first **close below the trough**. Shares the double-bottom scanner via signed candles.

## Virtual trade

| Field | Value |
|---|---|
| Entry | Detect-bar close |
| Reference | Intervening trough |
| Stop | `max(H1,H2) + 0.15×ATR` |
| Target | Trough − height, capped by entry − 1.5×ATR |

Shares the one-open slot with `double_bottom` on the same symbol×TF.

Occupancy: a close back above the trough that stays below the peak stop does not fail.

Config: `double.enable_top`. Version `double-v1`. See `docs/design-classical-patterns.md` and `docs/patterns/double-bottom.md`.

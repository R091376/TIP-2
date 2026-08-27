# Pattern: Inverse head and shoulders

| Field | Value |
|---|---|
| **Type** | `inverse_head_shoulders` |
| **Direction** | `long` |
| **Code** | Same engine as H&S (`sign=−1`) |
| **Status** | Implemented |

## Purpose

Bullish twin of head and shoulders. Head is the lowest low; armpits are the highest highs in the intervals. Detected on the first close **above** the interpolated neckline.

## Unsigned formulas

| Item | Rule |
|---|---|
| Prominence | `min(LS, RS) − H ≥ 0.5×ATR` (vs shoulders, not neckline) |
| Height | `neckline_at_head − H` |
| Stop | `RS − 0.15×ATR` (RS is a low) |
| Target | `neckline_at_break + height`, floor `entry + 1.5×ATR` |

Worked (ATR 2): LS 100, A 106, H 94, B 105.5, RS 100.4. `n_36 ≈ 105.083`. Close 105.50 detects. Stop 100.10. Target 116.833.

May overlap a double bottom on the same bar (independent families). Version `hs-v1`. See `docs/patterns/head-shoulders.md`.

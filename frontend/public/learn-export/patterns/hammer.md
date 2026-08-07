# Hammer

> **Kind:** pattern · **Slug:** `hammer` · **Group:** candlestick · **Direction:** long
>
> SPA: /learn/patterns/hammer  
> Markdown: /learn-export/patterns/hammer.md

Long lower wick, small body — potential bullish pin after pressure lower.

---

## Plain English

- A hammer is a pin-bar shape: a small real body near the top of the range and a long lower shadow, suggesting buyers pushed back after selling.
- TIP only uses closed bars and applies size filters vs ATR so tiny noise bars do not count.
- By default it also wants simple downtrend context so the shape is more reversal-like.

## How TIP calculates it

- On the signal bar: body = |close−open|, range = high−low, lower wick, upper wick.
- Require range ≥ 0.5×ATR, body ≤ 0.35×range, lower wick ≥ 2×body, upper wick ≤ 0.25×range.
- If require_trend_context is on, check a simple prior down-bias over trend_lookback.
- Detected → short lifecycle to confirm higher, hit 1.5×ATR target, or fail.

## Formula (plain)

Long lower shadow at least twice the body; small body; tiny upper wick; bar not microscopic vs ATR.

## Formula (formal)

```
body = |close − open|; range = high − low
lower ≥ 2×body; upper ≤ 0.25×range; body ≤ 0.35×range
range ≥ 0.5×ATR
```

## Lifecycle

- Detected: hammer geometry on closed bar (+ optional trend context)
- Confirmed: later close beyond signal high
- Succeeded: ~1.5×ATR from entry
- Failed: close through stop under the pin

## Worked example

Bar opens 100, trades to 94, closes 99.5; ATR is 4. Geometry passes → long pin lifecycle.

**Inputs**

| | |
| --- | --- |
| O/H/L/C | 100 / 100.2 / 94 / 99.5 |
| ATR | 4 |

**Steps**

- body 0.5, range 6.2, lower ~5.5 → geometry OK
- Entry ~99.5; target ~99.5+1.5×4; stop under the pin low

**Result:** Detected hammer when geometry (+ context) pass.

## Scenarios

### Detect geometry → target success

First TIP checks candle geometry on the closed bar. If it passes, it freezes a virtual long with stop under the pin and target about 1.5×ATR above entry.

**Setup**

| | |
| --- | --- |
| Signal O/H/L/C | 100 / 100.2 / 94 / 99.5 |
| ATR | 4 |
| body / range / lower / upper | 0.5 / 6.2 / ≈5.5 / ≈0.2 |
| Entry (close) | 99.5 |
| Stop (under pin) | near 94 |
| Target (~1.5×ATR) | 99.5 + 6 = 105.5 |

**Timeline**

- Bar 0 (detect) · OHLC O 100 / H 100.2 / L 94 / C 99.5 · — range ≥ 0.5×ATR, lower ≥ 2×body, small upper → Detected long hammer. Path starts high 100.2 / low 94.
- Bar 1 · OHLC H 102 / L 98 / C 101 · — Update MFE/MAE. May confirm if close clears signal high. Still open.
- Bar 2 (target) · OHLC H 106 / L 101 / C 105 · — High ≥ 105.5 → Succeeded.

**Final**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) | (106−99.5)/4 ≈ 1.63 R |
| MAE (R) | (99.5−94)/4 ≈ 1.38 R (pin low on detect counts) |

**Steps**

- Geometry is checked only on closed bars.
- ATR filters out tiny pins.
- After detect, the short lifecycle is the same family as other long virtual trades (confirm / target / stop).

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Succeeded hammer: target rule ends the trade; MFE/MAE still describe the path.

### Fail through stop under the pin

After detect, a closed bar finishes under the pin low → Failed. MFE may still show a bounce first.

**Setup**

| | |
| --- | --- |
| Entry / stop | 99.5 / ~94 |

**Timeline**

- Bar 0 · OHLC H 100.2 / L 94 / C 99.5 · — Detected.
- Bar 1 · OHLC H 101 / L 97 / C 100 · — Small bounce — some MFE. Still open.
- Bar 2 (fail) · OHLC H 98 / L 92 / C 93 · — close under stop → Failed. MAE uses the worst low.

**Steps**

- Stop lives under the hammer’s low region.
- Failure still records how far price went in favor first (MFE).

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Failed hammer with both MFE and MAE present.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| shadow_body_mult | 2 | `pinbar.shadow_body_mult` | Dominant wick must be ≥ this × body |
| max_body_range_ratio | 0.35 | `pinbar.max_body_range_ratio` | Max body as fraction of full range |
| max_opposite_wick_range_ratio | 0.25 | `pinbar.max_opposite_wick_range_ratio` | Max opposite wick as fraction of range |
| min_range_atr_mult | 0.5 | `pinbar.min_range_atr_mult` | Min full range vs ATR |
| success_atr_mult | 1.5 | `pinbar.success_atr_mult` | Target distance in ATR |
| require_trend_context | true | `pinbar.require_trend_context` | Require simple prior trend bias |
| trend_lookback | 10 | `pinbar.trend_lookback` | Bars used for trend context |
| max_candles_after_detect | 20 | `pinbar.max_candles_after_detect` | Max bars after detect |
| detector_version | pinbar-v1 | `pinbar.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Pattern type id: `hammer`
- Detector version hint: pinbar-v1

## Related

- [Shooting star](./shooting_star.md) (`pattern/shooting_star`)
- [Bullish engulfing](./bullish_engulfing.md) (`pattern/bullish_engulfing`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)

## Sources

**Docs**

- `docs/patterns/hammer-shooting-star.md`

**Code**

- `backend/app/patterns/pinbar.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*

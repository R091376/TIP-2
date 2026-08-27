# Volume breakout

> **Kind:** pattern · **Slug:** `volume_breakout` · **Group:** range · **Direction:** both
>
> SPA: /learn/patterns/volume_breakout  
> Markdown: /learn-export/patterns/volume_breakout.md

Unusually large volume plus a wide bar — even without a Donchian break.

---

## Plain English

- Volume breakout looks for a climax bar: volume much larger than average and a bar range that is meaningful vs ATR.
- Unlike price breakout, it does not require breaking the 20-bar high or low. Direction follows the bar’s close vs open.
- It does not fire on index symbols where volume is unusable (skip, not close-fallback).

## How TIP calculates it

- Compute prior volume SMA over 20 bars (signal excluded) and ATR(14).
- Volume OK if signal volume ≥ 2× prior SMA.
- Move OK if high−low ≥ 0.5×ATR.
- Both required → Detected; long if close ≥ open, else short.
- Then short lifecycle: confirm beyond signal extreme, target 1.5×ATR, or fail at signal high/low stop.

## Formula (plain)

Detect when volume ≥ 2× prior average and bar range ≥ 0.5×ATR. Long if close ≥ open, else short.

## Formula (formal)

```
volOk = volume_t ≥ 2.0 × prior_SMA20(volume)
moveOk = (high_t − low_t) ≥ 0.5 × ATR
direction = long if close ≥ open else short
```

## Lifecycle

- Detected: volume surge + wide bar (not necessarily Donchian break)
- Confirmed: later close beyond signal high (long) or low (short)
- Succeeded: ~1.5×ATR from entry
- Failed: close through signal stop (low for long / high for short)

## Worked example

Prior vol SMA 1M, signal 2.2M, ATR 4, green bar range 3 → long detect. Target entry+1.5×ATR; stop at signal low.

**Inputs**

| | |
| --- | --- |
| Prior vol SMA | 1,000,000 |
| Signal volume | 2,200,000 |
| ATR | 4 |
| Signal O/H/L/C | 100 / 103 / 100 / 102.5 |

**Steps**

- 2.2M ≥ 2×1M and range 3 ≥ 0.5×4 → Detect long
- Entry 102.5, stop 100, target 102.5+6 = 108.5

**Result:** Long volume_breakout with short lifecycle; never fires on index symbols.

## Scenarios

### Long success (volume + wide bar → target)

No Donchian ceiling required. A busy, wide green bar starts a virtual long. Later bars update MFE/MAE; target is entry + 1.5×ATR.

**Setup**

| | |
| --- | --- |
| Prior volume SMA | 1,000,000 |
| Signal volume | 2,200,000 (≥ 2×) |
| ATR | 4 |
| Signal O/H/L/C | 100 / 103 / 100 / 102.5 |
| Range vs 0.5×ATR | 3 ≥ 2 → move OK |
| Entry / stop / target | 102.5 / 100 / 108.5 |

**Timeline**

- Bar 0 (detect) · OHLC O 100 / H 103 / L 100 / C 102.5 · — vol+range OK, close ≥ open → Detected long. Freeze rails. Path starts at high 103 / low 100.
- Bar 1 · OHLC H 105 / L 101.5 / C 104 · — Best high 105. Not failed (close ≥ stop). Not at target yet. May confirm if close > signal high 103.
- Bar 2 (target) · OHLC H 109 / L 104 / C 108 · — High 109 ≥ 108.5 → Succeeded (on a bar after detect).

**Final**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) | (109−102.5)/4 = 1.625 R |
| MAE (R) | (102.5−100)/4 = 0.625 R |

**Steps**

- Both volume and range gates must pass on the same closed bar.
- Stop is the signal low for longs (signal high for shorts).
- Target is 1.5×ATR from entry in the trade direction.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Succeeded long volume_breakout; MFE/MAE both journaled.

### Fail stop — or never detect on index

Two different “no win” stories: (1) equity bar detects then fails through stop; (2) index symbol never detects.

**Setup**

| | |
| --- | --- |
| Same long rails | entry 102.5, stop 100, target 108.5 |

**Timeline**

- Bar 0 (detect) · OHLC H 103 / L 100 / C 102.5 · — Detected on a normal equity with usable volume.
- Bar 1 (fail) · OHLC H 102 / L 99 / C 99.5 · — close 99.5 < stop 100 → Failed. MAE uses worst low 99.

**Steps**

- Fail: close through the signal-side stop.
- Index segment: detector returns no pattern at all (not close-fallback).
- Quiet volume or tiny range: also no detect.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Equity path can Fail with MFE/MAE filled. Index path never opens a volume_breakout instance.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| volume_avg_period | 20 | `volume_breakout.volume_avg_period` | Prior volume SMA length |
| volume_multiplier | 2 | `volume_breakout.volume_multiplier` | Volume multiple required (default 2×) |
| min_range_atr_mult | 0.5 | `volume_breakout.min_range_atr_mult` | Min bar range vs ATR |
| success_atr_mult | 1.5 | `volume_breakout.success_atr_mult` | Target distance in ATR |
| max_candles_after_detect | 20 | `volume_breakout.max_candles_after_detect` | Max bars to live after detect |
| detector_version | volume-breakout-v1 | `volume_breakout.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Index volume note: Does not fire on index symbols (volume unusable → no detect). This is not CLOSE_FALLBACK.
- Pattern type id: `volume_breakout`
- Detector version hint: volume-breakout-v1

## Related

- [Volume SMA (20)](./../indicators/volume-sma-20.md) (`indicator/volume-sma-20`)
- [Breakout](./breakout.md) (`pattern/breakout`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Relative Volume (RVOL)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/relative-volume-rvol) — Unusual volume vs a lookback average
- [StockCharts ChartSchool — On Balance Volume](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-indicators/on-balance-volume-obv) — Volume confirms price commitment (Elder / Granville lineage)
- [Investopedia — Volume](https://www.investopedia.com/terms/v/volume.asp)

**Docs**

- `docs/patterns/volume-breakout.md`

**Code**

- `backend/app/patterns/volume_breakout.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*

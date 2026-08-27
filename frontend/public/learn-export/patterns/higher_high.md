# Higher high

> **Kind:** pattern · **Slug:** `higher_high` · **Group:** structure · **Direction:** long
>
> SPA: /learn/patterns/higher_high  
> Markdown: /learn-export/patterns/higher_high.md

A confirmed swing high that is higher than the previous swing high.

---

## Plain English

- Higher high is a market-structure idea: a new swing peak is higher than the last swing peak.
- TIP finds swing highs with a fractal width (default 2): a bar’s high is strictly above neighbors on both sides, only after the right-side bars have closed (no repaint).
- Then it tracks a long-biased virtual trade from that structure break.

## How TIP calculates it

- With fractal_width N=2, a pivot high at i is confirmed when bar i+N has closed.
- If that pivot high is greater than the previous pivot high → higher_high Detected.
- Entry on the confirm bar close; stop near prior swing low; confirm and target use ATR multiples.

## Formula (plain)

A bar is a swing high when its high is higher than the highs of the two bars on each side. A higher high is a new swing high above the previous one.

## Formula (formal)

```
pivot high at i if high_i > high_j for all j in [i−N, i+N] except i (N=2)
higher_high if high_i > previous pivot high
```

## Lifecycle

- Detected: confirmed pivot high > prior pivot high
- Confirmed: later close above the new structure high
- Succeeded: ~1.5×ATR
- Failed: close through structure stop (prior swing low area)

## Worked example

Prior pivot high 100; new confirmed pivot high 105 with N=2 → Detected long structure.

**Inputs**

| | |
| --- | --- |
| Prior pivot high | 100 |
| New pivot high | 105 |
| fractal_width | 2 |
| ATR | 2 |

**Steps**

- Wait for right-side bars to close (non-repaint)
- 105 > 100 → higher_high Detected
- Target ~ entry + 1.5×ATR; stop near prior swing low

**Result:** Detected once the new pivot is confirmed and higher.

## Scenarios

### Confirmed higher pivot → target success

Structure patterns are slower than single-candle pins: the pivot is only real after neighbor bars on the right have closed. Then a virtual long runs.

**Setup**

| | |
| --- | --- |
| Prior swing high | 100 |
| New swing high (pivot) | 105 |
| fractal_width N | 2 |
| ATR | 2 |
| Entry (confirm bar close) | 104 (example) |
| Target (~1.5×ATR) | 104 + 3 = 107 |
| Stop region | near prior swing low (example 98) |

**Timeline**

- Pivot bar · OHLC H 105 · — Candidate swing high — not confirmed until N bars to the right close.
- Confirm (+N bars) · OHLC neighbors closed; C 104 · — Pivot locked at 105 > prior 100 → Detected higher_high. Freeze rails.
- Later (target) · OHLC H 108 / C 107 · — High ≥ 107 → Succeeded.

**Final**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) | (108−104)/2 = 2.0 R |
| Structure note | Non-repainting pivot confirmation |

**Steps**

- Never treat an unconfirmed mid-pivot as final — right bars must close.
- Higher high compares successive confirmed pivots, not every bar high.
- After detect, stop/target/MFE/MAE follow the usual virtual long idea.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Succeeded higher_high structure trade with path metrics.

### Fail through structure stop

After detect, price closes through the prior swing-low stop region → Failed.

**Setup**

| | |
| --- | --- |
| Entry / stop | 104 / ~98 |

**Timeline**

- Detect · — higher_high confirmed.
- Fail bar · OHLC L 97 / C 97.5 · — close through stop → Failed. MAE captures the adverse run.

**Steps**

- Structure can fail like any virtual trade — journal still stores MFE/MAE.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Failed higher_high with both path metrics kept.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| fractal_width | 2 | `structure.fractal_width` | Neighbor bars each side for swing pivots |
| success_atr_mult | 1.5 | `structure.success_atr_mult` | Target distance in ATR |
| max_candles_after_detect | 30 | `structure.max_candles_after_detect` | Max bars after detect (structure uses 30) |
| detector_version | structure-v1 | `structure.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Pattern type id: `higher_high`
- Detector version hint: structure-v1

## Related

- [Lower low](./lower_low.md) (`pattern/lower_low`)
- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Alligator (Bill Williams)](https://chartschool.stockcharts.com/table-of-contents/technical-indicators-and-overlays/technical-overlays/alligator) — Williams fractals: a high/low that is the extreme of the surrounding N bars
- [StockCharts ChartSchool — Swing Charting](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/swing-charting)
- [Investopedia — Fractal (Williams)](https://www.investopedia.com/terms/f/fractal.asp) — Five-bar fractal (width 2) is the default Williams definition; TIP default width is also 2

**Docs**

- `docs/patterns/hh-ll.md`

**Code**

- `backend/app/patterns/structure.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*

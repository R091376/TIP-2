# Inside bar

> **Kind:** pattern · **Slug:** `inside_bar` · **Group:** range · **Direction:** both
>
> SPA: /learn/patterns/inside_bar  
> Markdown: /learn-export/patterns/inside_bar.md

A bar fully inside the mother bar, then a close that breaks the mother range.

---

## Plain English

- An inside bar is a pause: the middle bar’s high and low sit entirely inside the previous “mother” bar.
- TIP waits for a third bar that closes outside the mother’s range — that break sets long or short.
- Mother bar must be large enough vs ATR so the pattern is not pure noise.

## How TIP calculates it

- Identify mother (t−2), inside (t−1), break (t).
- Inside: high lower than mother high and low higher than mother low.
- Long break: close_t > mother high; short break: close_t < mother low.
- Mother range ≥ 0.5×ATR; then short lifecycle with mother extreme as stop.

## Formula (plain)

Middle bar inside mother; signal bar closes outside mother high (long) or low (short).

## Formula (formal)

```
high_{t−1} < high_{t−2} and low_{t−1} > low_{t−2}
long: close_t > high_{t−2}; short: close_t < low_{t−2}
range_mother ≥ 0.5×ATR
```

## Lifecycle

- Detected: mother + inside + break close outside mother
- Confirmed: later close still beyond mother extreme
- Succeeded: ~1.5×ATR from entry
- Failed: close back through mother stop side

## Worked example

Mother 100–110; inside 102–108; break closes 111 → long inside_bar.

**Inputs**

| | |
| --- | --- |
| Mother H/L | 110 / 100 |
| Inside H/L | 108 / 102 |
| Break close | 111 |
| ATR | 4 |

**Steps**

- Inside fully within mother
- close 111 > 110 → long Detected
- Stop references mother low 100; target entry+1.5×ATR

**Result:** Long inside_bar on the closed third bar.

## Scenarios

### Mother + inside + upside break → success

Three closed bars. Detect happens on the break bar, not on the inside bar alone. Then a normal long virtual trade runs.

**Setup**

| | |
| --- | --- |
| Mother H/L | 110 / 100 |
| Mother range vs ATR | 10 ≥ 0.5×ATR (ATR=4 → need ≥2) |
| Inside H/L | 108 / 102 |
| Break O/H/L/C | 108 / 112 / 107 / 111 |
| Entry / stop / target | 111 / 100 / 111+6 = 117 |

**Timeline**

- Mother · OHLC H 110 / L 100 · — Wide bar — the container.
- Inside · OHLC H 108 / L 102 · — Fully inside mother. Not a detect yet.
- Bar 0 (break / detect) · OHLC H 112 / L 107 / C 111 · — close 111 > mother high 110 → Detected long. Freeze rails.
- Bar 1 (target) · OHLC H 118 / L 112 / C 116 · — High ≥ 117 → Succeeded.

**Final**

| Metric | Value |
| --- | --- |
| Outcome | Succeeded |
| MFE (R) | (118−111)/4 = 1.75 R |
| MAE (R) | (111−107)/4 = 1.0 R |

**Steps**

- Detect only on the break close outside the mother.
- Stop for a long uses the mother low side.
- Short break would be close under mother low (mirror story).

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Succeeded long inside_bar; path metrics journaled.

### Fail — break then back through mother stop

After a long detect, price closes back through the mother low → Failed.

**Setup**

| | |
| --- | --- |
| Entry / stop | 111 / 100 |

**Timeline**

- Bar 0 · OHLC C 111 · — Detected long break.
- Bar 1 (fail) · OHLC H 110 / L 98 / C 99 · — close under mother low stop → Failed.

**Steps**

- False breakouts are exactly why both success and fail paths matter in stats.
- MFE may be small if price never ran after the break.

**Rules**

- Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.
- Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.
- These rules answer only: still open, win, or lose?

**Measurements**

- MFE (R): best move in your favor while the setup was open, divided by ATR at detect.
- MAE (R): worst move against you while open, divided by ATR at detect.
- Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.

**Result:** Failed inside_bar after a false upside break.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| min_mother_range_atr_mult | 0.5 | `inside_bar.min_mother_range_atr_mult` | Min mother range vs ATR |
| success_atr_mult | 1.5 | `inside_bar.success_atr_mult` | Target distance in ATR |
| max_candles_after_detect | 20 | `inside_bar.max_candles_after_detect` | Max bars after detect |
| max_bars_after_inside | 5 | `inside_bar.max_bars_after_inside` | Related timing window after inside bar |
| detector_version | inside-bar-v1 | `inside_bar.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Pattern type id: `inside_bar`
- Detector version hint: inside-bar-v1

## Related

- [Consolidation](./consolidation.md) (`pattern/consolidation`)
- [Breakout](./breakout.md) (`pattern/breakout`)

## Sources

**Docs**

- `docs/patterns/inside-bar.md`

**Code**

- `backend/app/patterns/inside_bar.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*

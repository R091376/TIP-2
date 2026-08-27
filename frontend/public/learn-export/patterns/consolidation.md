# Consolidation

> **Kind:** pattern · **Slug:** `consolidation` · **Group:** range · **Direction:** regime
>
> SPA: /learn/patterns/consolidation  
> Markdown: /learn-export/patterns/consolidation.md

A multi-bar tight range vs ATR — a volatility regime, not a buy/sell call at detect.

---

## Plain English

- Consolidation means the last several bars are squeezed into a small high–low range compared with ATR (normal move size).
- It is a regime signal: “price is coiling.” It is not a directional long trade signal at detect even if the stored direction field is a placeholder long.
- Useful context before expansion; TIP journals how the range resolves over time.

## How TIP calculates it

- Look at the last window_candles closed bars (default 10).
- Range R = max high − min low in that window.
- If R ≤ range_atr_mult × ATR, the window is tight → Detected (and prior window was not already tight — avoids re-detect spam).
- Freeze range high/low and mid; track until expansion outside the box, or max duration.

## Formula (plain)

Tight when (highest high − lowest low) over the last 10 bars is at most 1.5 × ATR.

## Formula (formal)

```
R = max(high) − min(low) over last M bars
tight if R ≤ κ × ATR, M=10, κ=1.5
```

## Lifecycle

- Detected: window range ≤ κ×ATR (regime, not directional entry)
- May tighten further if range shrinks (tighten_ratio)
- Succeeded: closed expand above range high or below range low
- Failed: max duration without expansion
- Closed-candle only throughout

## Worked example

Window high 105 / low 103, ATR 2 → R=2 ≤ 3 → detect regime. Expansion close outside box succeeds; max duration can fail.

**Inputs**

| | |
| --- | --- |
| Window high / low | 105 / 103 |
| R / ATR / κ | 2 / 2 / 1.5 |
| Threshold | 3 |

**Steps**

- R=2 ≤ 3 → Detected
- Mid label = 104 (not a buy price recommendation)
- Close > 105 or < 103 later → expansion success

**Result:** Regime detect only — not “go long at mid.”

## Scenarios

### Detect tight range → expand out (Succeeded)

TIP labels a coil when the recent box is small vs ATR. Leaving the box on a closed bar resolves the regime as Succeeded (expansion), not “price target hit” in the breakout sense.

**Setup**

| | |
| --- | --- |
| Window (10 bars) high / low | 105 / 103 |
| Range R | 2 |
| ATR | 2 |
| κ × ATR threshold | 1.5 × 2 = 3 |
| Frozen box | low 103, high 105, mid 104 |

**Timeline**

- Detect bar · OHLC inside 103–105 · — R=2 ≤ 3 and prior window was not already tight → Detected. Freeze box. Mid=104 is a label only.
- Later bar (still in box) · OHLC H 104.5 / L 103.2 / C 104 · — Still inside → remains open; path extremes update; duration ticks up.
- Expansion bar · OHLC H 106.5 / L 104 / C 106 · — close 106 > 105 → Succeeded with reason expand_up.

**At detect**

| Metric | Value |
| --- | --- |
| Regime | Consolidation (tight) |
| Box | 103 – 105 |
| Mid (label) | 104 |

**Steps**

- Tightness is range vs ATR, not a candle shape alone.
- Do not trade the mid as a breakout entry from this page alone.
- Expansion up or down both count as Succeeded resolution of the regime.

**Rules**

- Detect means the range is tight vs ATR — a regime label, not a buy or sell call.
- Expansion: close outside the frozen range high/low ends as Succeeded (resolved by expansion).
- Max duration without expansion can end as Failed (timed out still compressed).

**Measurements**

- Path extremes (best high / worst low while open) are still tracked for research.
- Do not read consolidation “entry” as a directional long recommendation — mid-range is a midpoint label only.

**Result:** TIP marks Succeeded (expand_up). That means the coil resolved outward — not a directional “long target hit.”

### Still compressed too long (Failed max duration)

If the box never expands before max_duration_candles, the instance can end as Failed with reason max_duration.

**Setup**

| | |
| --- | --- |
| Same box | 103 – 105 |
| max_duration_candles | 30 (default) |

**Steps**

- Each new bar inside the box increases duration.
- If duration hits the max while still inside → Failed (timed out).
- That is different from a directional stop-out on a long trade.

**Rules**

- Detect means the range is tight vs ATR — a regime label, not a buy or sell call.
- Expansion: close outside the frozen range high/low ends as Succeeded (resolved by expansion).
- Max duration without expansion can end as Failed (timed out still compressed).

**Measurements**

- Path extremes (best high / worst low while open) are still tracked for research.
- Do not read consolidation “entry” as a directional long recommendation — mid-range is a midpoint label only.

**Result:** TIP can mark Failed for timeout without ever “invalidating a long.” Read it as regime unresolved.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| window_candles | 10 | `consolidation.window_candles` | Bars in the compression window |
| range_atr_mult | 1.5 | `consolidation.range_atr_mult` | Max range as multiple of ATR to count as tight |
| max_duration_candles | 30 | `consolidation.max_duration_candles` | How long a consolidation instance may live |
| tighten_ratio | 0.85 | `consolidation.tighten_ratio` | Further squeeze threshold vs prior range |
| detector_version | consolidation-v1 | `consolidation.detector_version` | Journal version tag |
| atr_period | 14 | `atr_period` | ATR length for the tightness test |

## Flags

- Plotted on chart: no
- Closed candle only: yes
- Pattern type id: `consolidation`
- Detector version hint: consolidation-v1

## Related

- [ATR (14)](./../indicators/atr-14.md) (`indicator/atr-14`)
- [Inside bar](./inside_bar.md) (`pattern/inside_bar`)
- [Breakout](./breakout.md) (`pattern/breakout`)

## Sources

**Textbook / online**

- [StockCharts ChartSchool — Rectangle](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/rectangle) — Multi-bar congestion / trading range
- [StockCharts ChartSchool — Bollinger Band Squeeze](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/bollinger-band-squeeze) — Volatility compression before expansion
- [StockCharts ChartSchool — Narrow Range Day (NR7)](https://chartschool.stockcharts.com/table-of-contents/trading-strategies-and-models/trading-strategies/narrow-range-day-nr7) — Related compression idea; TIP uses ATR-normalized multi-bar range, not NR7

**Docs**

- `docs/patterns/consolidation.md`

**Code**

- `backend/app/patterns/consolidation.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*

# Donchian (20)

> **Kind:** indicator · **Slug:** `donchian-20` · **Group:** indicator
>
> SPA: /learn/indicators/donchian-20  
> Markdown: /learn-export/indicators/donchian-20.md

Highest high and lowest low over a lookback — the breakout ceiling/floor.

---

## Plain English

- Donchian channels track the highest high and lowest low over the last N bars.
- For breakouts, TIP uses the prior window: the N bars before the signal bar, so the signal cannot raise its own ceiling or lower its own floor.
- TIP does not plot Donchian on the chart; breakout and breakdown read it behind the scenes.

## How TIP calculates it

- Highest high = max of highs in the window; lowest low = min of lows in the window.
- Prior highest high at signal time t uses bars t−N … t−1 (excludes t).
- Breakout detects when close_t > prior highest high; breakdown when close_t < prior lowest low.

## Formula (plain)

Prior ceiling = max high of the previous 20 bars (not including the signal bar). Prior floor = min low of those same bars.

## Formula (formal)

```
highest_high(window) = max(high of bars in window)
lowest_low(window) = min(low of bars in window)
prior_highest_high at t = max(high_{t−20} … high_{t−1})
prior_lowest_low at t = min(low_{t−20} … low_{t−1})
```

## Worked example

Five toy highs; TIP uses 20 in production with the same prior-window idea.

*Example uses N=5 prior bars; TIP uses 20.*

**Inputs**

| | |
| --- | --- |
| Prior highs (oldest→newest) | 100, 102, 101, 105, 103 |
| Signal bar high / close | 108 / 107 |

**Steps**

- Prior window highs = 100, 102, 101, 105, 103
- prior_highest_high = 105 (signal 108 is excluded)
- Close 107 > 105 → price break above prior ceiling

**Result:** TIP would treat 105 as the frozen breakout reference if the rest of the breakout rules pass.

## Scenarios

### Prior window (correct — excludes signal bar)

The key beginner trap: if you include the signal bar’s high in the ceiling, a breakout bar can never break above itself.

**Setup**

| | |
| --- | --- |
| Prior highs | 100, 102, 101, 105, 103 |
| Signal high / close | 108 / 107 |

**Timeline**

- Prior window · OHLC highs 100…103 · — Max = 105. This is the ceiling reference.
- Signal bar · OHLC H 108 / C 107 · — close 107 > 105 → qualifies as a break above the prior ceiling (for breakout’s price leg).

**References**

| Metric | Value |
| --- | --- |
| Prior highest high | 105 |
| If signal were included | max would be 108 (wrong for TIP) |

**Steps**

- Build the window from bars before the signal only.
- Freeze that max high (or min low for breakdown) at detect.
- Later lifecycle uses the frozen reference, not a moving channel.

**Result:** TIP freezes reference = 105 for a long breakout story. See the Breakout page for entry/stop/target after detect.

### No break (close still under ceiling)

A high wick above the ceiling is not enough — breakout needs close above the prior high.

**Setup**

| | |
| --- | --- |
| Prior highest high | 105 |
| Signal H/L/C | 106 / 103 / 104 |

**Steps**

- High 106 poked above 105, but close 104 is not > 105.
- Breakout detector does not fire on this bar.

**Result:** TIP would not Detect breakout — the close must clear the prior ceiling.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| period | 20 | `indicators.donchian.period` | Lookback length for high/low channel (DEFAULT_PERIOD = 20) |

## Flags

- Plotted on chart: no
- Closed candle only: yes

## Related

- [ATR (14)](./atr-14.md) (`indicator/atr-14`)
- [Breakout](./../patterns/breakout.md) (`pattern/breakout`)
- [Breakdown](./../patterns/breakdown.md) (`pattern/breakdown`)

## Sources

**Docs**

- `docs/indicators/donchian-20.md`

**Code**

- `backend/app/indicators/donchian.py`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*

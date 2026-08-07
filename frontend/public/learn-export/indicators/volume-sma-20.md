# Volume SMA (20)

> **Kind:** indicator · **Slug:** `volume-sma-20` · **Group:** indicator
>
> SPA: /learn/indicators/volume-sma-20  
> Markdown: /learn-export/indicators/volume-sma-20.md

Average traded volume — the baseline for a “busy day” check.

---

## Plain English

- Volume SMA is a simple moving average of bar volume. It answers: “Is today’s volume large compared with recent bars?”
- On the chart, TIP draws a blue Volume SMA line on the volume pane (same period 20).
- Pattern detectors often use a prior average that excludes the signal bar, so the signal’s own volume does not inflate the baseline.

## How TIP calculates it

- Collect volume from the last N closed bars.
- Average = sum of those volumes ÷ N.
- For breakout confirmation, prior SMA uses the N bars before the signal bar (signal excluded).
- On the chart, the FE helper maps the same period across available candles for the blue line.

## Formula (plain)

Volume SMA = average of the last 20 bars’ volume. Prior SMA for a signal bar = average of the previous 20 bars only.

## Formula (formal)

```
SMA_t = (V_{t−n+1} + … + V_t) / n
prior_SMA at signal t = (V_{t−n} + … + V_{t−1}) / n
```

## Worked example

Check whether a signal bar is “busy” versus a toy 5-bar prior average.

*Example uses N=5; TIP uses 20.*

**Inputs**

| | |
| --- | --- |
| Prior volumes | 1000, 1200, 800, 1100, 900 |
| Signal volume | 2000 |
| Multiplier (breakout default) | 1.5× |

**Steps**

- prior SMA = 1000
- Threshold at 1.5× = 1500
- 2000 ≥ 1500 → volume confirmation passes

**Result:** Busy enough for breakout’s volume leg (toy window).

## Scenarios

### Busy enough for breakout volume leg

Breakout’s default confirmation wants detect-bar volume ≥ 1.5 × prior volume SMA. Volume breakout uses a stricter 2× by default.

**Setup**

| | |
| --- | --- |
| Prior volumes | 1000, 1200, 800, 1100, 900 |
| Prior SMA | 1000 |
| Signal volume | 2000 |
| Breakout multiplier | 1.5× → threshold 1500 |

**Timeline**

- Prior bars · — Average volume = 1000 (signal excluded from the baseline).
- Signal bar · — Volume 2000 ≥ 1500 → volume_ok for breakout confirmation.

**Steps**

- Always compare the signal to a baseline that does not include itself.
- On the chart, the blue line is the same period family so you can eye-check “busy vs quiet.”
- Volume breakout requires both high volume and a wide bar vs ATR — see that pattern page.

**Result:** TIP would count this as volume-confirmed for breakout’s volume leg (with the toy window).

### Too quiet (volume leg fails)

Same baseline, weaker signal volume — fails the 1.5× test.

**Setup**

| | |
| --- | --- |
| Prior SMA | 1000 |
| Signal volume | 1200 |
| Threshold 1.5× | 1500 |

**Steps**

- 1200 < 1500 → volume_ok is false.
- With confirmation_mode = both, breakout still needs the later close confirmation path and will not treat volume as OK.
- On index symbols with unusable volume, breakout falls back to close-only confirmation instead of inventing volume.

**Result:** TIP would not mark the volume leg OK. Close-fallback on indices is a different rule — not a fake volume number.

## TIP parameters (defaults)

| Name | Value | Config key | Notes |
| --- | --- | --- | --- |
| period | 20 | `indicators.volume_sma.period` | Backend VolumeSmaIndicator.DEFAULT_PERIOD |
| VOLUME_SMA_PERIOD | 20 | `VOLUME_SMA_PERIOD` | Frontend chart constant (helpers.js) — must match backend |

## Flags

- Plotted on chart: yes
- Closed candle only: yes

## Related

- [Breakout](./../patterns/breakout.md) (`pattern/breakout`)
- [Volume breakout](./../patterns/volume_breakout.md) (`pattern/volume_breakout`)

## Sources

**Docs**

- `docs/indicators/volume-sma-20.md`

**Code**

- `backend/app/indicators/volume_sma.py`
- `frontend/src/chart/helpers.js`

*Last reviewed: 2026-08-04*

---

*Educational only — not investment advice. Static export for AI tools and plain-text readers.*

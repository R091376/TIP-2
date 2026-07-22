# Pattern Detection — Finalized Definitions (v1.0)

Status: **Locked for MVP 1**, pending backtest validation once historical data is flowing. All thresholds below are the agreed starting defaults — they will be tuned based on real results, not treated as fixed forever.

**MVP 1 detector set: Breakout, Breakdown, Consolidation, Volume Breakout (4 detectors).**
Higher High / Lower Low is **deferred out of MVP 1** — see note at the end.

Universal volatility yardstick: **ATR(14)** is used everywhere "how big is a normal move for this stock" is needed, instead of fixed percentages. This adapts automatically to each symbol's own volatility.

Pattern instances are tracked **independently per timeframe** — a 5-minute Breakout and a 1-hour Breakout on the same symbol are two separate, unrelated pattern instances.

---

## 1. Breakout

**Reference level:** highest high of the last **20 candles** (or the top of an active Consolidation range, if one exists for that symbol/timeframe).

| Stage | Rule |
|---|---|
| **Detected** | Candle **closes** above the reference level. |
| **Confirmed** | Configurable — see "Confirmation mode" below. **Default: both** conditions required. |
| **Retested** | Price pulls back to within **0.25× ATR(14)** of the reference level without closing back below it. |
| **Strengthened** | Price extends a further **1× ATR(14)** beyond the reference level without the retest floor being violated. |
| **Succeeded** | Price moves **2× the distance** from the breakout level to the retest floor (2:1 reward:risk target). |
| **Failed** | Candle closes back **below** the reference level after breaking out. |

**Confirmation mode (configurable per pattern, default = both):**
- `close` — the next candle also closes above the reference level.
- `volume` — the breakout candle's volume is ≥ **1.5× the 20-period average volume**.
- `both` (default) — both of the above must hold before status moves from Detected to Confirmed.

## 2. Breakdown

Exact mirror of Breakout: reference level = lowest low of last 20 candles; every level/direction is reversed (retest from below, strengthening downward, success = 2:1 target downward, failure = close back above the level). Same confirmation-mode options and default.

## 3. Consolidation

| Parameter | Value |
|---|---|
| Window (M) | 10 candles |
| Tightness threshold | Range (highest high − lowest low over M candles) ≤ **1.5× ATR(14)** |
| Max duration | **30 candles** (3× M) before being closed out as Failed |

- **Detected**: condition holds for 10 consecutive candles.
- **Strengthened**: range keeps tightening, or duration extends well past 10 candles while still inside the threshold.
- **Succeeded**: price expands out of the range via a confirmed Breakout or Breakdown — logged as a separate, linked pattern instance.
- **Failed**: still consolidating past 30 candles without resolving.

## 4. Volume Breakout

| Parameter | Value |
|---|---|
| Volume multiplier | **2× the 20-period average volume** |
| Minimum price move | **0.5× ATR(14)** on the same candle |
| Overlap with Breakout/Breakdown | **Independent detector (Option A)** — both can fire on the same candle if conditions for each are separately met. The trader may see two alerts for one real-world event; that's an accepted tradeoff for MVP 1 rather than added complexity in the detectors. |

Lifecycle (Confirmed/Retested/Strengthened/Succeeded/Failed) follows the same shape as Breakout/Breakdown, using the same confirmation-mode setting.

---

## Deferred: Higher High / Lower Low

Not built in MVP 1. The open question was the "fractal width" (how many candles on each side confirm a swing point) — since you're not yet sure what feels right here, this is deferred rather than guessed at. When revisited: pick a fractal width (commonly 2–3 candles each side), decide whether it should be a full lifecycle pattern or a single-state structural signal (see earlier draft's discussion), and backtest before enabling.

# Patterns: Hammer & Shooting Star (pin bars)

| Field | Value |
|---|---|
| **Types** | `hammer` (long), `shooting_star` (short) |
| **Code (planned)** | `com.tip.patterns.pinbar` |
| **Status** | **Implemented** (classic TA sources + TIP short lifecycle) |
| **Sources** | Steve Nison, *Japanese Candlestick Charting Techniques* (hammer / hanging man / shooting star geometry); Thomas Bulkowski, *Encyclopedia of Candlestick Charts* (shadow ratios, confirmation); John Murphy, *Technical Analysis of the Financial Markets* (candlestick context & follow-through) |

## Purpose

Detect classic **pin-bar** reversals on **closed** candles only (non-repainting), then track a short virtual trade:

**Detected → Confirmed → Succeeded | Failed** (no Retested / Strengthened).

Shared geometry package; two `PatternType` values so journal/stats stay clean.

## Trusted-source geometry (Nison / Bulkowski)

### Common pin-bar rules (both patterns)

Let for the signal bar:

\[
body = |close - open|, \quad
range = high - low, \quad
upper = high - \max(open, close), \quad
lower = \min(open, close) - low
\]

| Rule | Default (TIP) | Source rationale |
|---|---|---|
| Meaningful range | \(range \ge 0.5 \times ATR(14)\) | Avoid micro-noise bars (TIP volatility yardstick; Nison: candles need context of size) |
| Body not dominant | \(body \le 0.35 \times range\) | Small real body relative to full range (Nison: small body for hammer/star) |
| Long shadow | dominant wick \(\ge 2.0 \times body\) | Nison: lower/upper shadow typically **at least 2×** the real body |
| Opposite wick small | opposite wick \(\le 0.25 \times range\) | Nison: little or no shadow on the other side |
| Min body floor | \(body \ge 1e-9\) or treat doji-like: if body ≈ 0, require dominant wick \(\ge 0.6 \times range\) | Doji-pin edge case (Nison allows very small body) |

### Hammer (`hammer`, direction **long**)

| | |
|---|---|
| **Geometry** | Long **lower** shadow; body in **upper** portion of range |
| **Formal** | \(lower \ge 2 \times body\), \(upper \le 0.25 \times range\), \(body \le 0.35 \times range\), \(range \ge 0.5 \times ATR\) |
| **Optional context (default ON)** | Prior trend: close of bar \(t-1\) is below SMA of closes over **N=10** prior bars *or* bar \(t-1\) close &lt; bar \(t-3\) close (simple down-bias). Configurable `require-prior-downtrend`. |
| **Note** | Nison’s **Hanging Man** uses the same shape at highs; we **do not** emit hanging man as a separate type in v1 — hammer is **bullish only** with downtrend context filter when enabled. |

### Shooting Star (`shooting_star`, direction **short**)

| | |
|---|---|
| **Geometry** | Long **upper** shadow; body in **lower** portion of range |
| **Formal** | \(upper \ge 2 \times body\), \(lower \le 0.25 \times range\), \(body \le 0.35 \times range\), \(range \ge 0.5 \times ATR\) |
| **Optional context (default ON)** | Prior up-bias mirror of hammer (`require-prior-uptrend`). |

## Indicators used

| Indicator | Role |
|---|---|
| ATR(14) | Min bar size; stop/target R unit |
| Optional SMA(10) of close | Prior trend context (simple; not a full swing engine) |

No volume requirement (works on indices). Volume not used for confirmation.

## Virtual trade (read-only)

### Hammer (long)

| Field | Value |
|---|---|
| **Entry** | Detected bar **close** |
| **Stop** | Detected bar **low** (invalidate if later close **&lt; low**) |
| **Reference level** | Detected bar **low** (invalidation / structure) |
| **Target** | \(entry + successAtrMult \times ATR\) (default **1.5× ATR**) |
| **lookback_high** (schema reuse) | Detected bar **high** (store signal bar high for overlays/debug) |

### Shooting Star (short)

| Field | Value |
|---|---|
| **Entry** | Detected bar **close** |
| **Stop** | Detected bar **high** |
| **Reference level** | Detected bar **high** |
| **Target** | \(entry - successAtrMult \times ATR\) (default **1.5× ATR**) |
| **lookback_high** | Detected bar **low** (schema field reused as paired extreme) |

## Lifecycle (short)

Evaluation: **closed candles only**. Order on each bar after detect: **Failed → Succeeded → Confirmed**.

### DETECTED

- Geometry + optional trend context pass.
- ATR available.
- Anti-spam: at most **one open** hammer **or** shooting_star per symbol×TF (or: no second detect of same type while one open). Prefer: **no open pin-bar of either type** for that series.

### CONFIRMED (next-bar / later-bar hold)

| Pattern | Rule |
|---|---|
| Hammer | A **later** closed bar (not detect bar) with \(close \ge entry\) **and** \(close > detect\_mid\) where \(detect\_mid = (open+close)/2\) of signal bar — practical follow-through (Bulkowski: confirmation often next close above hammer). Simpler default: **\(close > signal\,high\)** (strong) **or** **\(close \ge entry\)** (mild). **TIP default: \(close > signal high\)** for confirm (stricter, fewer false holds). |
| Shooting Star | Later bar: **\(close < signal low\)**. |

If confirm never happens and stop is hit first → **Failed** without Confirmed (flag_confirmed stays false; terminal Failed).

### SUCCEEDED

| Pattern | Rule |
|---|---|
| Hammer | Closed bar **high** \(\ge target\) |
| Shooting Star | Closed bar **low** \(\le target\) |

May occur on confirm bar or later. Same-bar as detect: **not** allowed (need at least progression after print).

### FAILED

| Pattern | Rule |
|---|---|
| Hammer | Closed bar **close &lt; stop** (signal low) |
| Shooting Star | Closed bar **close &gt; stop** (signal high) |

### EXPIRED

Reuse existing session / max-duration expiry (`PatternLifecycleSupport` / session policies). Pin-bars also expire after **`max-candles-after-detect`** default **20** closed bars if not terminal.

**Retested / Strengthened:** never set for these types.

## Config (`tip.pattern.pinbar.*`)

| Key | Default | Notes |
|---|---|---|
| `shadow-body-mult` | `2.0` | Dominant wick ≥ mult × body |
| `max-body-range-ratio` | `0.35` | Body ≤ ratio × range |
| `max-opposite-wick-range-ratio` | `0.25` | Opposite wick ≤ ratio × range |
| `min-range-atr-mult` | `0.5` | range ≥ mult × ATR |
| `success-atr-mult` | `1.5` | Target distance |
| `require-trend-context` | `true` | Prior down/up bias |
| `trend-lookback` | `10` | SMA length for context |
| `max-candles-after-detect` | `20` | Soft expire |
| `detector-version` | `pinbar-v1` | Journal comparability |

## Wiring

- `PatternType.HAMMER`, `PatternType.SHOOTING_STAR`
- Flyway: extend `pattern_type` CHECK
- `PatternEvaluator`: run pin-bar bar evaluator after breakout/breakdown (order: advance opens → detect)
- FE: no change required (generic alerts/overlay)
- Docs: this file; `docs/README.md` link

## Anti-goals (v1)

- Hanging man as separate short at highs  
- Inverted hammer / morning star multi-candle sets  
- Volume filters  
- Repainting on forming bar  

## Implementation checklist

1. Domain: geometry helper + Detector + Lifecycle + BarEvaluator + Config  
2. PatternType + V3 migration CHECK  
3. PatternProperties + yml  
4. PatternEvaluator wire  
5. Unit tests (geometry, confirm, fail, success)  
6. Manual: equity during session with postgres patterns enabled  

# Patterns: Higher High / Lower Low

| Field | Value |
|---|---|
| **Types** | `higher_high` (long), `lower_low` (short) |
| **Code** | `com.tip.patterns.structure` |
| **Status** | Implemented |
| **Sources** | Bill Williams fractals (width \(N\)); John Murphy swing structure; TIP deferred note (fractal width default **2**) |

## Swing definition (fractal width \(N=2\))

Pivot high at index \(i\) when \(high_i\) is **strictly greater** than highs of \(i-N..i+N\) (excluding \(i\)).

Pivot low: strict minimum of lows in the window.

A pivot at \(i\) is **confirmed** only when bar \(i+N\) has closed (no repaint).

## Detect

On each closed bar, let \(i = n - 1 - N\) (candidate pivot just confirmed):

- **Higher High**: \(i\) is pivot high and there exists a prior pivot high \(j < i\) with \(high_i > high_j\) (use nearest prior pivot high).
- **Lower Low**: mirror with pivot lows.

## Lifecycle

| | Higher High | Lower Low |
|---|---|---|
| Entry | close of confirm bar | same |
| Reference / structure | new swing high | new swing low |
| Stop | prior swing low (or pivot − ATR if none) | prior swing high (or pivot + ATR) |
| Confirm | later close > new HH | later close < new LL |
| Target | entry ± 1.5×ATR | |
| Fail | close &lt; stop | close &gt; stop |

Anti-spam: one open HH **or** LL per symbol×TF (shared structure slot).

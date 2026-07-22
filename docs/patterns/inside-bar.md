# Pattern: Inside Bar Breakout

| Field | Value |
|---|---|
| **Type** | `inside_bar` (direction long or short at detect) |
| **Code** | `com.tip.patterns.insidebar` |
| **Status** | Implemented |
| **Sources** | Al Brooks / common price-action (mother–inside–break); Murphy (consolidation then expansion) |

## Structure

Three closed bars: **mother** (\(t-2\)), **inside** (\(t-1\)), **break** (\(t\) = signal).

1. Inside: \(high_{t-1} < high_{t-2}\) and \(low_{t-1} > low_{t-2}\)
2. Long break: \(close_t > high_{t-2}\)
3. Short break: \(close_t < low_{t-2}\)

Min mother range vs ATR: \(range_{mother} \ge minRangeAtrMult \times ATR\).

## Lifecycle

| | Long | Short |
|---|---|---|
| Entry | break close | break close |
| Stop | mother low | mother high |
| Confirm | later close > mother high | later close < mother low |
| Target | entry ± 1.5×ATR | |
| Fail | close &lt; mother low | close &gt; mother high |

Anti-spam: one open `inside_bar` per symbol×TF.

# Pattern: Double bottom

| Field | Value |
|---|---|
| **Type** | `double_bottom` |
| **Direction** | `long` |
| **Code** | `app.patterns.double` (`detect_double`, `evaluate_double_bar`) |
| **Status** | Implemented (closed-candle, non-repainting) |
| **Sources** | Edwards & Magee, *Technical Analysis of Stock Trends* (W, measuring formula); John Murphy, *Technical Analysis of the Financial Markets*; Thomas Bulkowski, *Encyclopedia of Chart Patterns* (close above confirmation line); [StockCharts ChartSchool — Double Bottom Reversal](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/double-bottom-reversal) |

## Purpose

Two confirmed pivot lows within an ATR equality band, intervening peak as confirmation line. Detected on the **first close above the peak** after the second trough is confirmed. Virtual long with structural stop below the lower trough and a measured-move target.

## Indicators used

| Indicator | Role |
|---|---|
| Fractal pivots (`structure.py`, width 2) | L1, peak, L2 |
| ATR(14) | Equality band, height filter, stop buffer, R unit |
| Volume SMA(20) | Optional confirmation; recorded as `volume_ok_at_detect` |

## Virtual trade

| Field | Value |
|---|---|
| Entry | Detect-bar **close** |
| Reference | Intervening peak (horizontal) |
| Stop | `min(L1,L2) − 0.15×ATR` (`sanitize_stop`) |
| Target | Peak + 1.0 × height, floored at entry + 1.5×ATR |
| R unit | `atr_at_detect` |

A close back through the peak that does **not** pierce the stop does **not** fail. That occupies the one-open double family slot until stop, target, max bars, or session expiry (15m `session_end`).

## Lifecycle

Closed-candle only.

- **Detected** — first close `> peak` after L2 is confirmed.
- **Confirmed** — later close still `> peak` (default mode `close`). `VOLUME` may confirm on the detect bar.
- **Retested** — after confirmed, `low ≤ peak + 0.25×ATR` and `close ≥ peak`. Target is **not** rewritten.
- **Strengthened** — `high ≥ peak + 1.0×ATR`.
- **Succeeded** — not detect bar, `high ≥ target`.
- **Failed** — `close < stop` (wins over succeed on the same bar).
- **Expired** — `max_candles_after_detect` (40) or session/1d caps.

## Config

`Settings.double` / `TIP_PATTERN_DOUBLE_ENABLED`. 5m/1m off; 15m+ on. Version `double-v1`.

See `docs/design-classical-patterns.md`.

## Trusted-source geometry

TIP is a closed-candle detector, not a discretionary replica of daily/weekly textbook charts. Mapping:

| Rule | Source | TIP v1 |
|---|---|---|
| Two troughs + intervening peak | Edwards & Magee; Murphy; StockCharts | Confirmed Williams fractals (width 2) |
| Pattern is not complete until the peak breaks | [StockCharts](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/double-bottom-reversal) | First **closed** bar `> peak` |
| Confirm on a **close** above the confirmation line | [Bulkowski setup](https://thepatternsite.com/dbsetup.html) | Same; wick-through does not detect |
| Troughs roughly equal | StockCharts: within ~3% | ATR band (`trough_tolerance_atr`) |
| Meaningful bounce between troughs | StockCharts: 10–20% | `min_height_atr` |
| Measured-move target | Edwards & Magee; StockCharts | Height projected above the peak, plus ATR floor |
| Volume expansion on the break | StockCharts (especially bottoms) | Optional; recorded as `volume_ok_at_detect` |
| Prior downtrend required | All reversal textbooks | **Not required** — geometry + close-through only |
| Throwback to broken resistance | StockCharts; Bulkowski | Retested stage |
| Invalidation | Close through the troughs | Structural stop; a close back through the peak that stays above the stop does **not** fail (occupancy) |

## Online sources

- [StockCharts ChartSchool — Double Bottom Reversal](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/double-bottom-reversal)
- [Bulkowski — Double Bottom types](https://thepatternsite.com/DoubleBottomTypes.html)
- [Bulkowski — Double Bottom setup (close above confirmation)](https://thepatternsite.com/dbsetup.html)
- [Investopedia — Double Bottom](https://www.investopedia.com/terms/d/doublebottom.asp)

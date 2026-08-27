# Pattern: Head and shoulders

| Field | Value |
|---|---|
| **Type** | `head_shoulders` |
| **Direction** | `short` |
| **Code** | `app.patterns.head_shoulders` |
| **Status** | Implemented |
| **Sources** | Edwards & Magee, *Technical Analysis of Stock Trends* (H&S + measuring formula); John Murphy; Thomas Bulkowski, *Encyclopedia of Chart Patterns* (close through neckline); [StockCharts ChartSchool — Head and Shoulders Top](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/head-and-shoulders-top) |

## Purpose

Five confirmed fractals: left shoulder, left armpit, head, right armpit, right shoulder. Neckline through the armpits (may slope). Detected on the first **close below** the interpolated neckline after the right shoulder is confirmed. Wick-through does not detect.

## Virtual trade

| Field | Value |
|---|---|
| Entry | Detect-bar close |
| Reference | Neckline price **at the break bar** (frozen horizontal) |
| Stop | Right shoulder + 0.15×ATR |
| Target | `reference − 1.0 × (head − neckline at head)`, ATR floor 1.5× |

Sloped neckline is stored in `geometry_json` for overlay only. Lifecycle uses the frozen `reference_level`.

## Ranking / anti-spam

Among 5-pivot sets whose first close-through is now: max head-to-neckline, then newest RS. One open `head_shoulders` **or** `inverse_head_shoulders` per symbol×TF. Neckline reclaim occupies that slot until stop/expiry.

`Settings.head_shoulders` / `TIP_PATTERN_HS_ENABLED`. Version `hs-v1`. See `docs/design-classical-patterns.md`.

## Trusted-source geometry

TIP is a closed-candle detector, not a discretionary replica. Mapping:

| Rule | Source | TIP v1 |
|---|---|---|
| LS, head, RS + neckline through the armpits | Edwards & Magee; StockCharts | Five confirmed Williams fractals |
| Neckline may slope | StockCharts; Bulkowski | `allow_sloping_neckline` (default on) |
| Pattern is not complete until the neckline breaks | StockCharts | First **closed** bar through interpolated neckline |
| Confirm on a **close** through the neckline | [Bulkowski H&S top](https://thepatternsite.com/hst.html) (close below an up-sloping neckline, or below the right armpit when the neckline slopes down) | Close through interpolated neckline; wick-through does not detect |
| Measured-move target | Edwards & Magee; StockCharts (head-to-neckline height projected from the break) | Same, plus ATR floor |
| Volume: LS > head > RS, expansion on the break | Edwards & Magee; StockCharts | Optional; recorded as `volume_ok_at_detect` |
| Prior uptrend required | All reversal textbooks | **Not required** |
| Return to neckline (pullback) | StockCharts; Bulkowski | Retested stage vs frozen neckline-at-break |
| Invalidation | Close back through the right shoulder / pattern extreme | Structural stop beyond RS; a neckline reclaim that stays inside the stop does **not** fail (occupancy) |

## Online sources

- [StockCharts ChartSchool — Head and Shoulders Top](https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/head-and-shoulders-top)
- [Bulkowski — Head-and-Shoulders Tops](https://thepatternsite.com/hst.html)
- [Investopedia — Head and Shoulders](https://www.investopedia.com/terms/h/head-shoulders.asp)

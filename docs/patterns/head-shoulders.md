# Pattern: Head and shoulders

| Field | Value |
|---|---|
| **Type** | `head_shoulders` |
| **Direction** | `short` |
| **Code** | `app.patterns.head_shoulders` |
| **Status** | Implemented |

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

Config: `Settings.head_shoulders` / `TIP_PATTERN_HS_ENABLED`. Version `hs-v1`. See `docs/design-classical-patterns.md`.

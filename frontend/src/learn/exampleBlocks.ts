/**
 * Shared beginner callouts for worked examples.
 * Keep copy free of engine field names users never see.
 */

export const LONG_TRADE_RULES_VS_MEASUREMENTS = {
  rules: [
    'Stop / invalidation: a closed bar that breaks the stop ends the setup as Failed.',
    'Target: when price reaches the target on a closed bar (high for longs), the setup ends as Succeeded.',
    'These rules answer only: still open, win, or lose?',
  ],
  measurements: [
    'MFE (R): best move in your favor while the setup was open, divided by ATR at detect.',
    'MAE (R): worst move against you while open, divided by ATR at detect.',
    'Both are measured on every finished setup (success and fail). They are a path scoreboard, not the same thing as target/stop.',
  ],
}

export const SHORT_TRADE_RULES_VS_MEASUREMENTS = {
  rules: [
    'Stop / invalidation: a closed bar that reclaims the stop ends the setup as Failed.',
    'Target: when price reaches the downside target (low for shorts), the setup ends as Succeeded.',
    'These rules answer only: still open, win, or lose?',
  ],
  measurements: [
    'MFE (R): best move in the short direction (price falling) while open, ÷ ATR at detect.',
    'MAE (R): worst move against the short (price rising) while open, ÷ ATR at detect.',
    'Both are recorded on success and fail — not “win-only” or “loss-only” metrics.',
  ],
}

export const REGIME_RULES_VS_MEASUREMENTS = {
  rules: [
    'Detect means the range is tight vs ATR — a regime label, not a buy or sell call.',
    'Expansion: close outside the frozen range high/low ends as Succeeded (resolved by expansion).',
    'Max duration without expansion can end as Failed (timed out still compressed).',
  ],
  measurements: [
    'Path extremes (best high / worst low while open) are still tracked for research.',
    'Do not read consolidation “entry” as a directional long recommendation — mid-range is a midpoint label only.',
  ],
}

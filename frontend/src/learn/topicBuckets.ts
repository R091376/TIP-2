/**
 * Topic slug → tipDefaults bucket path(s) that tipParameters must fully cover.
 * Shared detector configs: dual topics each list the full shared bucket keys.
 */
export const TOPIC_DEFAULTS_BUCKET: Record<string, string[]> = {
  'atr-14': ['indicators.atr', 'atr_period'],
  'donchian-20': ['indicators.donchian'],
  'volume-sma-20': ['indicators.volume_sma', 'VOLUME_SMA_PERIOD'],
  breakout: ['breakout', 'atr_period'],
  breakdown: ['breakdown', 'atr_period'],
  consolidation: ['consolidation', 'atr_period'],
  volume_breakout: ['volume_breakout', 'atr_period'],
  inside_bar: ['inside_bar', 'atr_period'],
  hammer: ['pinbar', 'atr_period'],
  shooting_star: ['pinbar', 'atr_period'],
  bullish_engulfing: ['engulfing', 'atr_period'],
  bearish_engulfing: ['engulfing', 'atr_period'],
  higher_high: ['structure', 'atr_period'],
  lower_low: ['structure', 'atr_period'],
  double_bottom: ['double', 'atr_period'],
  double_top: ['double', 'atr_period'],
  head_shoulders: ['head_shoulders', 'atr_period'],
  inverse_head_shoulders: ['head_shoulders', 'atr_period'],
  'woodie-sr': [
    'pattern_sr_enabled',
    'pattern_sr_stamp_enabled',
    'pattern_sr_research_enabled',
    'pattern_sr_backfill_on_startup',
    'pattern_sr_near_atr',
    'pattern_sr_method',
  ],
}

/** Expected PatternType value strings (backend enum). */
export const EXPECTED_PATTERN_TYPE_IDS = [
  'breakout',
  'breakdown',
  'consolidation',
  'volume_breakout',
  'hammer',
  'shooting_star',
  'bullish_engulfing',
  'bearish_engulfing',
  'inside_bar',
  'higher_high',
  'lower_low',
  'double_bottom',
  'double_top',
  'head_shoulders',
  'inverse_head_shoulders',
] as const

/** Expected indicator slugs. */
export const EXPECTED_INDICATOR_SLUGS = [
  'atr-14',
  'donchian-20',
  'volume-sma-20',
] as const

/** Expected Learn concept slugs (not PatternType / indicator). */
export const EXPECTED_CONCEPT_SLUGS = ['woodie-sr'] as const

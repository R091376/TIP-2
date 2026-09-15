/** Backend PatternType values — shared by Stats, Alerts, Learn. */
export const PATTERN_TYPE_IDS = [
  'breakout',
  'breakdown',
  'volume_breakout',
  'consolidation',
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

export type PatternTypeId = (typeof PATTERN_TYPE_IDS)[number]

export function formatPatternTypeLabel(patternType: string): string {
  if (!patternType) return 'Pattern'
  return String(patternType).replace(/_/g, ' ')
}

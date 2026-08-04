import { tipDefaults } from '../learn/tipDefaults'
import type { PatternInstanceDto } from '../services/patternInstancesApi'

/** Map detector pattern type → tipDefaults / config bucket name. */
export function patternConfigBucket(patternType: string | null | undefined): string | null {
  const t = (patternType || '').toLowerCase()
  if (!t) return null
  if (t === 'breakout') return 'breakout'
  if (t === 'breakdown') return 'breakdown'
  if (t === 'hammer' || t === 'shooting_star') return 'pinbar'
  if (t === 'bullish_engulfing' || t === 'bearish_engulfing') return 'engulfing'
  if (t === 'inside_bar') return 'inside_bar'
  if (t === 'higher_high' || t === 'lower_low') return 'structure'
  if (t === 'consolidation') return 'consolidation'
  if (t === 'volume_breakout') return 'volume_breakout'
  return null
}

export type ConfigKnob = { key: string; value: string; label: string }

/** Human labels for common detector knobs shown in the inspect panel. */
const KNOB_LABELS: Record<string, string> = {
  success_atr_mult: 'Target ATR mult',
  success_atr_mult_without_retest: 'Target ATR mult (no retest)',
  success_rr: 'Success R:R',
  retest_atr_mult: 'Retest band (×ATR)',
  strengthen_atr_mult: 'Strengthen (×ATR)',
  min_range_atr_mult: 'Min range (×ATR)',
  min_mother_range_atr_mult: 'Min mother range (×ATR)',
  range_atr_mult: 'Range (×ATR)',
  volume_multiplier: 'Volume mult',
  lookback_candles: 'Lookback bars',
  max_candles_after_detect: 'Max bars after detect',
  max_duration_candles: 'Max duration bars',
  confirmation_mode: 'Confirmation mode',
  detector_version: 'Detector version',
}

/**
 * Detector defaults from tipDefaults (not per-instance frozen config).
 * Helps explain how rails relate to ATR multipliers.
 */
export function patternConfigKnobs(patternType: string | null | undefined): ConfigKnob[] {
  const bucket = patternConfigBucket(patternType)
  if (!bucket) return []
  const obj = (tipDefaults as Record<string, unknown>)[bucket]
  if (!obj || typeof obj !== 'object') return []
  const preferred = [
    'success_atr_mult',
    'success_atr_mult_without_retest',
    'success_rr',
    'retest_atr_mult',
    'strengthen_atr_mult',
    'min_range_atr_mult',
    'min_mother_range_atr_mult',
    'range_atr_mult',
    'volume_multiplier',
    'lookback_candles',
    'max_candles_after_detect',
    'max_duration_candles',
    'confirmation_mode',
    'detector_version',
  ]
  const out: ConfigKnob[] = []
  const rec = obj as Record<string, unknown>
  for (const key of preferred) {
    if (rec[key] === undefined) continue
    out.push({
      key,
      value: String(rec[key]),
      label: KNOB_LABELS[key] || key,
    })
  }
  return out
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export type PatternInstanceMetrics = {
  atr: number | null
  entry: number | null
  stop: number | null
  target: number | null
  reference: number | null
  /** |entry − stop| / ATR */
  riskR: number | null
  /** favor distance entry→target / ATR */
  rewardR: number | null
  /** rewardR / riskR when both positive */
  rewardRisk: number | null
  mfeR: number | null
  maeR: number | null
  moveR: number | null
  direction: string
}

/**
 * Compute R-metrics from instance prices (same spirit as backend max_favorable_r / move_r).
 */
export function computeInstanceMetrics(
  inst: PatternInstanceDto | null | undefined,
): PatternInstanceMetrics {
  const empty: PatternInstanceMetrics = {
    atr: null,
    entry: null,
    stop: null,
    target: null,
    reference: null,
    riskR: null,
    rewardR: null,
    rewardRisk: null,
    mfeR: null,
    maeR: null,
    moveR: null,
    direction: 'long',
  }
  if (!inst) return empty

  const atr = num(inst.atrAtDetect)
  const entry = num(inst.entryPrice)
  const stop = num(inst.stopLevel)
  const target = num(inst.targetLevel)
  const reference = num(inst.referenceLevel)
  const mfePrice = num(inst.mfePrice)
  const maePrice = num(inst.maePrice)
  const endPrice = num(inst.endPrice)
  const direction = (inst.direction || 'long').toLowerCase()
  const short = direction === 'short'

  let riskR: number | null = null
  let rewardR: number | null = null
  let mfeR: number | null = null
  let maeR: number | null = null
  let moveR: number | null = null

  if (atr != null && atr > 0 && entry != null) {
    if (stop != null) {
      riskR = Math.abs(entry - stop) / atr
    }
    if (target != null) {
      rewardR = short ? (entry - target) / atr : (target - entry) / atr
    }
    if (mfePrice != null) {
      mfeR = short ? (entry - mfePrice) / atr : (mfePrice - entry) / atr
      if (mfeR < 0) mfeR = 0
    }
    if (maePrice != null) {
      maeR = short ? (maePrice - entry) / atr : (entry - maePrice) / atr
      if (maeR < 0) maeR = 0
    }
    if (endPrice != null) {
      moveR = short ? (entry - endPrice) / atr : (endPrice - entry) / atr
    }
  }

  let rewardRisk: number | null = null
  if (riskR != null && riskR > 0 && rewardR != null && rewardR > 0) {
    rewardRisk = rewardR / riskR
  }

  return {
    atr,
    entry,
    stop,
    target,
    reference,
    riskR,
    rewardR,
    rewardRisk,
    mfeR,
    maeR,
    moveR,
    direction,
  }
}

export function formatMetricPrice(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return Number(n).toFixed(digits)
}

export function formatMetricR(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return `${Number(n).toFixed(digits)} R`
}

/**
 * Committed snapshot of TIP detector / indicator defaults.
 * Source of truth for values: tipDefaults.json (also read by scripts/export_tip_defaults.py).
 * Keep in sync with backend/app/config.py and indicator DEFAULT_PERIOD values.
 * Values are raw JSON types; compare via serializeTipDefault.
 */
import tipDefaultsJson from './tipDefaults.json'

export const tipDefaults = tipDefaultsJson

export type TipDefaults = typeof tipDefaults

/** Lookup a tipDefaults leaf by configKey (e.g. breakout.lookback_candles, atr_period). */
export function lookupTipDefault(configKey: string): unknown {
  const parts = configKey.split('.')
  let cur: unknown = tipDefaults
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') {
      throw new Error(`tipDefaults path not found: ${configKey}`)
    }
    cur = (cur as Record<string, unknown>)[p]
  }
  if (cur === undefined) {
    throw new Error(`tipDefaults path not found: ${configKey}`)
  }
  return cur
}

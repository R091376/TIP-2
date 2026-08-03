import { serializeTipDefault } from './serializeTipDefault'
import { lookupTipDefault } from './tipDefaults'
import type { TipParameter } from './types'

/** Build a TipParameter whose value is always taken from tipDefaults. */
export function tipParam(
  configKey: string,
  notes?: string,
  opts?: { advanced?: boolean; name?: string },
): TipParameter {
  const leaf = configKey.includes('.')
    ? configKey.slice(configKey.lastIndexOf('.') + 1)
    : configKey
  return {
    name: opts?.name ?? leaf,
    value: serializeTipDefault(lookupTipDefault(configKey)),
    configKey,
    notes,
    advanced: opts?.advanced,
  }
}

/** All keys in a tipDefaults object bucket (e.g. 'breakout'). */
export function bucketLeafKeys(bucket: string): string[] {
  const obj = lookupTipDefault(bucket)
  if (obj == null || typeof obj !== 'object') {
    throw new Error(`not a bucket object: ${bucket}`)
  }
  return Object.keys(obj as Record<string, unknown>)
}

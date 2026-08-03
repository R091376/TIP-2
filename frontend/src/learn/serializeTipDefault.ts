/**
 * Canonical string form for tipDefaults leaves and TipParameter.value.
 * Integer-valued numbers → "2" (not "2.0"). Booleans → true/false.
 */
export function serializeTipDefault(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('non-finite tip default')
    if (Number.isInteger(v)) return String(v)
    return String(v)
  }
  if (typeof v === 'string') return v
  throw new Error(`unsupported tip default type: ${typeof v}`)
}

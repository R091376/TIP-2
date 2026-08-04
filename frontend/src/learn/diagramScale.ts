/** Linear scale helpers for Learn SVG diagrams (unit-tested). */

export function nicePad(min: number, max: number, padRatio = 0.08): { min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 }
  }
  if (max <= min) {
    const mid = min
    const span = Math.max(Math.abs(mid) * 0.05, 1)
    return { min: mid - span, max: mid + span }
  }
  const span = max - min
  const pad = span * padRatio
  return { min: min - pad, max: max + pad }
}

export function makeLinearScale(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number) {
  const { min, max } = nicePad(domainMin, domainMax)
  const d = max - min || 1
  return (v: number) => rangeMax - ((v - min) / d) * (rangeMax - rangeMin)
}

export function candleDomain(
  candles: { h: number; l: number }[],
  levels: { price: number }[] = [],
): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const c of candles) {
    min = Math.min(min, c.l)
    max = Math.max(max, c.h)
  }
  for (const lv of levels) {
    min = Math.min(min, lv.price)
    max = Math.max(max, lv.price)
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 }
  }
  return nicePad(min, max)
}

export function barDomain(values: number[]): { min: number; max: number } {
  if (!values.length) return { min: 0, max: 1 }
  const max = Math.max(...values, 0)
  const min = 0
  return nicePad(min, max, 0.05)
}

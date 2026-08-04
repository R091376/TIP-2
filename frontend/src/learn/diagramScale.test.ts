import { describe, expect, it } from 'vitest'
import { barDomain, candleDomain, makeLinearScale, nicePad } from './diagramScale'

describe('diagramScale', () => {
  it('nicePad expands equal min/max', () => {
    const { min, max } = nicePad(10, 10)
    expect(min).toBeLessThan(10)
    expect(max).toBeGreaterThan(10)
  })

  it('candleDomain includes levels', () => {
    const d = candleDomain(
      [
        { h: 102, l: 100 },
        { h: 103, l: 101 },
      ],
      [{ price: 104 }, { price: 99 }],
    )
    expect(d.min).toBeLessThan(99)
    expect(d.max).toBeGreaterThan(104)
  })

  it('makeLinearScale maps high price to top of plot', () => {
    const yOf = makeLinearScale(100, 110, 0, 100)
    expect(yOf(110)).toBeLessThan(yOf(100))
    expect(yOf(105)).toBeCloseTo(50, 0)
  })

  it('barDomain starts at 0 baseline pad', () => {
    const d = barDomain([6, 4, 7])
    expect(d.min).toBeLessThanOrEqual(0)
    expect(d.max).toBeGreaterThan(7)
  })
})

import { describe, expect, it } from 'vitest'
import { serializeTipDefault } from './serializeTipDefault'

describe('serializeTipDefault', () => {
  it('serializes booleans lowercase', () => {
    expect(serializeTipDefault(true)).toBe('true')
    expect(serializeTipDefault(false)).toBe('false')
  })

  it('serializes integer-valued numbers without decimal', () => {
    expect(serializeTipDefault(2)).toBe('2')
    expect(serializeTipDefault(2.0)).toBe('2')
    expect(serializeTipDefault(1.0)).toBe('1')
    expect(serializeTipDefault(14)).toBe('14')
  })

  it('serializes non-integer numbers', () => {
    expect(serializeTipDefault(1.5)).toBe('1.5')
    expect(serializeTipDefault(0.25)).toBe('0.25')
    expect(serializeTipDefault(0.35)).toBe('0.35')
  })

  it('passes strings through', () => {
    expect(serializeTipDefault('both')).toBe('both')
    expect(serializeTipDefault('breakout-v1')).toBe('breakout-v1')
  })
})

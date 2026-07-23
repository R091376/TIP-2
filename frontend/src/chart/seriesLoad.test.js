import { describe, expect, it } from 'vitest'
import { bootstrapGate } from './seriesLoad'

describe('bootstrapGate', () => {
  it('maps FAILED / PENDING / READY (and unknown as ready)', () => {
    expect(bootstrapGate({ bootstrapStatus: 'FAILED' })).toBe('failed')
    expect(bootstrapGate({ bootstrapStatus: 'PENDING' })).toBe('pending')
    expect(bootstrapGate({ bootstrapStatus: 'READY' })).toBe('ready')
    expect(bootstrapGate({ bootstrapStatus: 'ready' })).toBe('ready')
    expect(bootstrapGate(null)).toBe('ready')
  })
})

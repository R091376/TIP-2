import { describe, expect, it } from 'vitest'
import { anyAbortSignal, isAbortError, timeoutSignal } from './abort'

describe('timeoutSignal', () => {
  it('aborts after ms', async () => {
    const { signal, clear } = timeoutSignal(30)
    await new Promise((r) => setTimeout(r, 50))
    expect(signal.aborted).toBe(true)
    clear()
  })

  it('aborts when parent aborts', () => {
    const parent = new AbortController()
    const { signal, clear } = timeoutSignal(10_000, parent.signal)
    expect(signal.aborted).toBe(false)
    parent.abort()
    expect(signal.aborted).toBe(true)
    clear()
  })
})

describe('anyAbortSignal', () => {
  it('aborts when any child aborts', () => {
    const a = new AbortController()
    const b = new AbortController()
    const combined = anyAbortSignal([a.signal, b.signal])
    expect(combined.aborted).toBe(false)
    b.abort()
    expect(combined.aborted).toBe(true)
  })
})

describe('isAbortError', () => {
  it('detects DOMException AbortError', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true)
  })

  it('rejects other errors', () => {
    expect(isAbortError(new Error('nope'))).toBe(false)
  })
})

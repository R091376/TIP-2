import { describe, expect, it } from 'vitest'
import { pickPrimarySymbolEntry } from './chartSymbolPrefs'

const nifty = {
  symbolId: 'NSE_INDEX|Nifty 50',
  segment: 'NSE_INDEX',
  instrumentType: 'INDEX',
  bootstrapStatus: 'READY',
  active: true,
}
const reliance = {
  symbolId: 'NSE_EQ|INE002A01018',
  segment: 'NSE_EQ',
  instrumentType: 'EQ',
  bootstrapStatus: 'READY',
  active: true,
}
const tcs = {
  symbolId: 'NSE_EQ|INE467B01029',
  segment: 'NSE_EQ',
  instrumentType: 'EQ',
  bootstrapStatus: 'PENDING',
  active: true,
}

describe('pickPrimarySymbolEntry', () => {
  it('prefers deep-link over equity default', () => {
    const p = pickPrimarySymbolEntry([nifty, reliance], nifty.symbolId, reliance.symbolId)
    expect(p?.symbolId).toBe(nifty.symbolId)
  })

  it('prefers last symbol when still on list', () => {
    const p = pickPrimarySymbolEntry([nifty, reliance, tcs], null, tcs.symbolId)
    expect(p?.symbolId).toBe(tcs.symbolId)
  })

  it('prefers READY equity over index first entry', () => {
    const p = pickPrimarySymbolEntry([nifty, reliance], null, null)
    expect(p?.symbolId).toBe(reliance.symbolId)
  })

  it('falls back to first READY when no equity', () => {
    const p = pickPrimarySymbolEntry([nifty], null, null)
    expect(p?.symbolId).toBe(nifty.symbolId)
  })
})

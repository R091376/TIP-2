import { describe, expect, it } from 'vitest'
import {
  PAPER_PRODUCTS,
  isCncOpenShort,
  paperProductsForOpenSide,
} from './paperOrderConstants'

describe('paperProductsForOpenSide', () => {
  it('offers MIS and CNC on BUY', () => {
    expect(paperProductsForOpenSide('BUY')).toEqual(PAPER_PRODUCTS)
  })

  it('offers only MIS on SELL (no delivery short)', () => {
    expect(paperProductsForOpenSide('SELL')).toEqual(['MIS'])
  })
})

describe('isCncOpenShort', () => {
  it('is true for CNC SELL without closeLotId', () => {
    expect(isCncOpenShort('SELL', 'CNC')).toBe(true)
    expect(isCncOpenShort('sell', 'cnc', null)).toBe(true)
    expect(isCncOpenShort('SELL', 'CNC', '')).toBe(true)
  })

  it('is false when closing a lot, buying, or using MIS', () => {
    expect(isCncOpenShort('SELL', 'CNC', 'lot-1')).toBe(false)
    expect(isCncOpenShort('BUY', 'CNC')).toBe(false)
    expect(isCncOpenShort('SELL', 'MIS')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { validatePaperOrderFields } from './PaperOrderModal'

describe('validatePaperOrderFields', () => {
  it('rejects non-integer or qty < 1', () => {
    expect(validatePaperOrderFields({ side: 'BUY', orderType: 'MARKET', qty: 0 })).toMatch(
      /quantity/i,
    )
    expect(validatePaperOrderFields({ side: 'BUY', orderType: 'MARKET', qty: 1.5 })).toMatch(
      /quantity/i,
    )
    expect(validatePaperOrderFields({ side: 'BUY', orderType: 'MARKET', qty: '' })).toMatch(
      /quantity/i,
    )
    expect(validatePaperOrderFields({ side: 'BUY', orderType: 'MARKET', qty: -2 })).toMatch(
      /quantity/i,
    )
  })

  it('MARKET: valid with no price/trigger', () => {
    expect(
      validatePaperOrderFields({ side: 'BUY', orderType: 'MARKET', qty: 1 }),
    ).toBe('')
  })

  it('MARKET: rejects price or trigger', () => {
    expect(
      validatePaperOrderFields({
        side: 'BUY',
        orderType: 'MARKET',
        qty: 1,
        price: 100,
      }),
    ).toMatch(/MARKET/i)
    expect(
      validatePaperOrderFields({
        side: 'BUY',
        orderType: 'MARKET',
        qty: 1,
        trigger: 100,
      }),
    ).toMatch(/MARKET/i)
  })

  it('LIMIT: requires price > 0, no trigger', () => {
    expect(
      validatePaperOrderFields({ side: 'BUY', orderType: 'LIMIT', qty: 1 }),
    ).toMatch(/price/i)
    expect(
      validatePaperOrderFields({
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 0,
      }),
    ).toMatch(/price/i)
    expect(
      validatePaperOrderFields({
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 100,
        trigger: 90,
      }),
    ).toMatch(/trigger/i)
    expect(
      validatePaperOrderFields({
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 2,
        price: 2450.5,
      }),
    ).toBe('')
  })

  it('SL: requires price and trigger > 0', () => {
    expect(
      validatePaperOrderFields({ side: 'BUY', orderType: 'SL', qty: 1, price: 100 }),
    ).toMatch(/trigger/i)
    expect(
      validatePaperOrderFields({ side: 'BUY', orderType: 'SL', qty: 1, trigger: 100 }),
    ).toMatch(/price/i)
    expect(
      validatePaperOrderFields({
        side: 'BUY',
        orderType: 'SL',
        qty: 1,
        price: 0,
        trigger: 90,
      }),
    ).toMatch(/price/i)
  })

  it('SL BUY: price >= trigger (equality ok)', () => {
    expect(
      validatePaperOrderFields({
        side: 'BUY',
        orderType: 'SL',
        qty: 1,
        price: 100,
        trigger: 100,
      }),
    ).toBe('')
    expect(
      validatePaperOrderFields({
        side: 'BUY',
        orderType: 'SL',
        qty: 1,
        price: 110,
        trigger: 100,
      }),
    ).toBe('')
    expect(
      validatePaperOrderFields({
        side: 'BUY',
        orderType: 'SL',
        qty: 1,
        price: 90,
        trigger: 100,
      }),
    ).toMatch(/BUY SL/i)
  })

  it('SL SELL: price <= trigger (equality ok)', () => {
    expect(
      validatePaperOrderFields({
        side: 'SELL',
        orderType: 'SL',
        qty: 1,
        price: 100,
        trigger: 100,
      }),
    ).toBe('')
    expect(
      validatePaperOrderFields({
        side: 'SELL',
        orderType: 'SL',
        qty: 1,
        price: 90,
        trigger: 100,
      }),
    ).toBe('')
    expect(
      validatePaperOrderFields({
        side: 'SELL',
        orderType: 'SL',
        qty: 1,
        price: 110,
        trigger: 100,
      }),
    ).toMatch(/SELL SL/i)
  })

  it('SL_M: requires trigger > 0, no price', () => {
    expect(
      validatePaperOrderFields({ side: 'BUY', orderType: 'SL_M', qty: 1 }),
    ).toMatch(/trigger/i)
    expect(
      validatePaperOrderFields({
        side: 'BUY',
        orderType: 'SL_M',
        qty: 1,
        trigger: 0,
      }),
    ).toMatch(/trigger/i)
    expect(
      validatePaperOrderFields({
        side: 'BUY',
        orderType: 'SL_M',
        qty: 1,
        price: 100,
        trigger: 95,
      }),
    ).toMatch(/price/i)
    expect(
      validatePaperOrderFields({
        side: 'SELL',
        orderType: 'SL_M',
        qty: 3,
        trigger: 2400,
      }),
    ).toBe('')
  })

  it('rejects unknown order type', () => {
    expect(
      validatePaperOrderFields({ side: 'BUY', orderType: 'FOO', qty: 1 }),
    ).toMatch(/invalid/i)
  })

  it('accepts string qty integers', () => {
    expect(
      validatePaperOrderFields({ side: 'BUY', orderType: 'MARKET', qty: '10' }),
    ).toBe('')
  })

  it('rejects CNC SELL without closeLotId (open short)', () => {
    expect(
      validatePaperOrderFields({
        side: 'SELL',
        orderType: 'MARKET',
        qty: 1,
        product: 'CNC',
      }),
    ).toMatch(/CNC cannot open a short/i)
  })

  it('allows CNC SELL when closing a lot', () => {
    expect(
      validatePaperOrderFields({
        side: 'SELL',
        orderType: 'MARKET',
        qty: 1,
        product: 'CNC',
        closeLotId: 'lot-1',
      }),
    ).toBe('')
  })

  it('allows MIS SELL open short', () => {
    expect(
      validatePaperOrderFields({
        side: 'SELL',
        orderType: 'MARKET',
        qty: 1,
        product: 'MIS',
      }),
    ).toBe('')
  })

  it('allows CNC BUY', () => {
    expect(
      validatePaperOrderFields({
        side: 'BUY',
        orderType: 'MARKET',
        qty: 1,
        product: 'CNC',
      }),
    ).toBe('')
  })
})

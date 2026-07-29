import { describe, expect, it } from 'vitest'
import {
  avgFillPrice,
  computeOrderPnl,
  indexLotsByEntryOrderId,
  realizedClosePnl,
  resolveOrderAvgFill,
  unrealizedEntryPnl,
} from './paperOrderPnl'

describe('realizedClosePnl', () => {
  it('close long SELL: exit - entry', () => {
    expect(realizedClosePnl('SELL', 100, 110, 10)).toBe(100)
  })
  it('cover short BUY: entry - exit', () => {
    expect(realizedClosePnl('BUY', 100, 90, 10)).toBe(100)
  })
})

describe('unrealizedEntryPnl', () => {
  it('long BUY', () => {
    expect(unrealizedEntryPnl('BUY', 100, 105, 4)).toBe(20)
  })
  it('short SELL', () => {
    expect(unrealizedEntryPnl('SELL', 100, 95, 4)).toBe(20)
  })
})

describe('avgFillPrice', () => {
  it('vwaverage', () => {
    expect(
      avgFillPrice([
        { orderId: 'a', qty: 2, price: 10 },
        { orderId: 'a', qty: 2, price: 20 },
      ]),
    ).toBe(15)
  })
})

describe('resolveOrderAvgFill', () => {
  it('uses VWAP only when fill qty covers order.filledQty', () => {
    const r = resolveOrderAvgFill(
      { id: 'o', filledQty: 10, price: null },
      [
        { orderId: 'o', qty: 6, price: 100 },
        { orderId: 'o', qty: 4, price: 110 },
      ],
    )
    expect(r.fillsIncomplete).toBe(false)
    expect(r.avg).toBe(104)
  })

  it('does not partial-VWAP when fills incomplete and no limit price', () => {
    const r = resolveOrderAvgFill(
      { id: 'o', filledQty: 10, price: null },
      [{ orderId: 'o', qty: 3, price: 100 }],
    )
    expect(r.fillsIncomplete).toBe(true)
    expect(r.avg).toBeNull()
  })

  it('uses order.price as proxy when fills incomplete', () => {
    const r = resolveOrderAvgFill(
      { id: 'o', filledQty: 10, price: 99.5 },
      [{ orderId: 'o', qty: 2, price: 100 }],
    )
    expect(r.fillsIncomplete).toBe(true)
    expect(r.avg).toBe(99.5)
  })

  it('MARKET filled with no fills → null avg, incomplete history', () => {
    const r = resolveOrderAvgFill({ id: 'o', filledQty: 5, price: null }, [])
    expect(r.avg).toBeNull()
    expect(r.fillsIncomplete).toBe(true)
  })
})

describe('computeOrderPnl', () => {
  const lotsById = new Map([
    [
      'lot1',
      {
        id: 'lot1',
        avgEntryPrice: 100,
        ltp: 110,
        qtyOpen: 10,
        status: 'OPEN',
        side: 'LONG',
        entryOrderId: 'o1',
      },
    ],
    [
      'lot2',
      {
        id: 'lot2',
        avgEntryPrice: 200,
        ltp: null,
        qtyOpen: 0,
        status: 'CLOSED',
        side: 'LONG',
        entryOrderId: 'o-entry',
      },
    ],
  ])
  const byEntry = indexLotsByEntryOrderId([...lotsById.values()])

  it('unrealized on open entry BUY with complete fills', () => {
    const r = computeOrderPnl(
      { id: 'o1', side: 'BUY', filledQty: 5 },
      [{ orderId: 'o1', lotId: 'lot1', qty: 5, price: 100 }],
      lotsById,
      byEntry,
    )
    expect(r.kind).toBe('unrealized')
    expect(r.value).toBe(50)
  })

  it('resolves entry lot via entryOrderId when fills missing', () => {
    const r = computeOrderPnl(
      { id: 'o1', side: 'BUY', filledQty: 5, price: 100 },
      [],
      lotsById,
      byEntry,
    )
    expect(r.kind).toBe('unrealized')
    expect(r.value).toBe(50)
  })

  it('incomplete fills without price → null value (no partial VWAP)', () => {
    const r = computeOrderPnl(
      { id: 'o2', side: 'SELL', filledQty: 10, closeLotId: 'lot2', price: null },
      [{ orderId: 'o2', lotId: 'lot2', qty: 3, price: 210 }],
      lotsById,
      byEntry,
    )
    expect(r.kind).toBe('realized')
    expect(r.value).toBeNull()
    expect(r.fillsIncomplete).toBe(true)
    expect(r.filledQty).toBe(10)
  })

  it('realized on close SELL with complete fills', () => {
    const r = computeOrderPnl(
      { id: 'o2', side: 'SELL', filledQty: 5, closeLotId: 'lot2' },
      [{ orderId: 'o2', lotId: 'lot2', qty: 5, price: 210 }],
      lotsById,
      byEntry,
    )
    expect(r.kind).toBe('realized')
    expect(r.value).toBe(50)
  })

  it('none when order.filledQty is 0', () => {
    const r = computeOrderPnl({ id: 'o3', side: 'BUY', filledQty: 0 }, [], lotsById, byEntry)
    expect(r.kind).toBe('none')
    expect(r.value).toBeNull()
  })
})

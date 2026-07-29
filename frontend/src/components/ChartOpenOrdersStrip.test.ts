import { describe, expect, it } from 'vitest'
import {
  filterOpenOrdersForSymbol,
  isOpenOrderStatus,
  mergeOptimisticOrder,
} from './ChartOpenOrdersStrip'

const openBuy = {
  id: 'o1',
  instrumentKey: 'NSE_EQ|RELIANCE',
  tradingSymbol: 'RELIANCE',
  side: 'BUY',
  orderType: 'LIMIT',
  product: 'MIS',
  qty: 10,
  filledQty: 0,
  price: 2450,
  triggerPrice: null,
  status: 'OPEN',
  rejectReason: null,
  closeLotId: null,
  createdAt: null,
}

const triggerSell = {
  ...openBuy,
  id: 'o2',
  side: 'SELL',
  orderType: 'SL_M',
  price: null,
  triggerPrice: 2400,
  status: 'TRIGGER_PENDING',
}

const filled = {
  ...openBuy,
  id: 'o3',
  status: 'FILLED',
}

const otherSym = {
  ...openBuy,
  id: 'o4',
  instrumentKey: 'NSE_EQ|TCS',
  tradingSymbol: 'TCS',
}

describe('isOpenOrderStatus', () => {
  it('accepts OPEN, TRIGGER_PENDING, PARTIALLY_FILLED', () => {
    expect(isOpenOrderStatus('OPEN')).toBe(true)
    expect(isOpenOrderStatus('TRIGGER_PENDING')).toBe(true)
    expect(isOpenOrderStatus('PARTIALLY_FILLED')).toBe(true)
  })

  it('rejects terminal statuses', () => {
    expect(isOpenOrderStatus('FILLED')).toBe(false)
    expect(isOpenOrderStatus('CANCELLED')).toBe(false)
    expect(isOpenOrderStatus('REJECTED')).toBe(false)
    expect(isOpenOrderStatus(undefined)).toBe(false)
  })
})

describe('filterOpenOrdersForSymbol', () => {
  const all = [openBuy, triggerSell, filled, otherSym]

  it('filters by instrumentKey + open statuses', () => {
    const rows = filterOpenOrdersForSymbol(all, 'NSE_EQ|RELIANCE')
    expect(rows.map((r) => r.id)).toEqual(['o1', 'o2'])
  })

  it('returns empty when no instrumentKey', () => {
    expect(filterOpenOrdersForSymbol(all, null)).toEqual([])
    expect(filterOpenOrdersForSymbol(all, undefined)).toEqual([])
    expect(filterOpenOrdersForSymbol(all, '')).toEqual([])
  })

  it('handles null/non-array orders', () => {
    expect(filterOpenOrdersForSymbol(null, 'NSE_EQ|RELIANCE')).toEqual([])
    expect(filterOpenOrdersForSymbol(undefined, 'NSE_EQ|RELIANCE')).toEqual([])
  })
})

describe('mergeOptimisticOrder', () => {
  it('prepends matching open optimistic when not already listed', () => {
    const rows = mergeOptimisticOrder([triggerSell], openBuy, 'NSE_EQ|RELIANCE')
    expect(rows.map((r) => r.id)).toEqual(['o1', 'o2'])
  })

  it('does not duplicate when id already present', () => {
    const rows = mergeOptimisticOrder([openBuy], openBuy, 'NSE_EQ|RELIANCE')
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('o1')
  })

  it('ignores optimistic for other symbol or non-open status', () => {
    expect(mergeOptimisticOrder([], otherSym, 'NSE_EQ|RELIANCE')).toEqual([])
    expect(mergeOptimisticOrder([], filled, 'NSE_EQ|RELIANCE')).toEqual([])
    expect(mergeOptimisticOrder([], openBuy, null)).toEqual([])
    expect(mergeOptimisticOrder([triggerSell], null, 'NSE_EQ|RELIANCE')).toEqual([
      triggerSell,
    ])
  })
})

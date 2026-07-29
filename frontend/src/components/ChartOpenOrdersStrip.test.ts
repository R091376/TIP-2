import { describe, expect, it } from 'vitest'
import {
  applyCancelledFilter,
  filterOpenOrdersForSymbol,
  isOpenOrderStatus,
  mergeOptimisticOrder,
  shouldClearOptimisticAfterFetch,
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

  it('does not ghost when only open rows are empty but optimistic still open snapshot', () => {
    // Lifecycle: after clear, merge is not called with optimistic; this guards de-dupe path
    // when open list already has the id from a prior open poll.
    const rows = mergeOptimisticOrder([openBuy], openBuy, 'NSE_EQ|RELIANCE')
    expect(rows).toHaveLength(1)
  })
})

describe('shouldClearOptimisticAfterFetch', () => {
  it('keeps optimistic when server has not seen the id yet', () => {
    expect(shouldClearOptimisticAfterFetch(openBuy, [triggerSell])).toBe(false)
    expect(shouldClearOptimisticAfterFetch(openBuy, [])).toBe(false)
    expect(shouldClearOptimisticAfterFetch(null, [openBuy])).toBe(false)
  })

  it('clears when server returns same id as OPEN (absorbed)', () => {
    expect(shouldClearOptimisticAfterFetch(openBuy, [openBuy, triggerSell])).toBe(true)
  })

  it('clears when server returns same id as FILLED (no ghost after fill)', () => {
    const filledSameId = { ...openBuy, status: 'FILLED' }
    expect(shouldClearOptimisticAfterFetch(openBuy, [filledSameId])).toBe(true)
    // And open filter alone would drop it — merge must not re-add after clear
    const openOnly = filterOpenOrdersForSymbol([filledSameId], 'NSE_EQ|RELIANCE')
    expect(openOnly).toEqual([])
    expect(mergeOptimisticOrder(openOnly, null, 'NSE_EQ|RELIANCE')).toEqual([])
  })

  it('clears when server returns same id as CANCELLED', () => {
    const cancelled = { ...openBuy, status: 'CANCELLED' }
    expect(shouldClearOptimisticAfterFetch(openBuy, [cancelled])).toBe(true)
  })
})

describe('applyCancelledFilter', () => {
  it('removes cancelled ids from open rows', () => {
    const rows = applyCancelledFilter([openBuy, triggerSell], new Set(['o1']))
    expect(rows.map((r) => r.id)).toEqual(['o2'])
  })

  it('no-ops when empty/null cancelled set', () => {
    expect(applyCancelledFilter([openBuy], new Set())).toEqual([openBuy])
    expect(applyCancelledFilter([openBuy], null)).toEqual([openBuy])
  })
})

describe('optimistic lifecycle (merge + clear)', () => {
  it('place → server OPEN → clear → merge shows only server row', () => {
    const optimistic = openBuy
    // Before server ack: merge shows optimistic
    expect(
      mergeOptimisticOrder([], optimistic, 'NSE_EQ|RELIANCE').map((r) => r.id),
    ).toEqual(['o1'])
    // Server returns OPEN
    expect(shouldClearOptimisticAfterFetch(optimistic, [openBuy])).toBe(true)
    const afterClear = null
    expect(
      mergeOptimisticOrder([openBuy], afterClear, 'NSE_EQ|RELIANCE').map((r) => r.id),
    ).toEqual(['o1'])
  })

  it('place → server FILLED → clear → no open rows (no resurrection)', () => {
    const optimistic = openBuy
    const filledSame = { ...openBuy, status: 'FILLED' }
    expect(shouldClearOptimisticAfterFetch(optimistic, [filledSame])).toBe(true)
    const open = filterOpenOrdersForSymbol([filledSame], 'NSE_EQ|RELIANCE')
    expect(mergeOptimisticOrder(open, null, 'NSE_EQ|RELIANCE')).toEqual([])
  })

  it('cancel filter suppresses open row even if still in server list', () => {
    const open = filterOpenOrdersForSymbol([openBuy, triggerSell], 'NSE_EQ|RELIANCE')
    const display = applyCancelledFilter(open, new Set(['o1']))
    expect(display.map((r) => r.id)).toEqual(['o2'])
    // Unrelated optimistic for o2 still merges if needed
    expect(
      mergeOptimisticOrder(display, null, 'NSE_EQ|RELIANCE').map((r) => r.id),
    ).toEqual(['o2'])
  })
})

import { describe, expect, it } from 'vitest'
import {
  computeDayRealizedFromCloseFills,
  computePaperPnl,
  computeWinRate,
  formatWinRatePct,
  istDateKey,
} from './paperPnl'

describe('computePaperPnl overall', () => {
  it('sums overall realized and unrealized', () => {
    const s = computePaperPnl(
      [
        {
          id: 'a',
          status: 'OPEN',
          realizedPnl: 100,
          unrealizedPnl: 50,
          avgEntryPrice: 10,
        },
        {
          id: 'b',
          status: 'CLOSED',
          realizedPnl: 200,
          unrealizedPnl: null,
          avgEntryPrice: 20,
        },
      ],
      { fills: [], orders: [] },
    )
    expect(s.overallRealized).toBe(300)
    expect(s.overallUnrealized).toBe(50)
    expect(s.overallTotal).toBe(350)
    expect(s.dayRealized).toBe(0)
  })
})

describe('computeDayRealizedFromCloseFills', () => {
  const today = '2026-07-29'
  const lots = [
    { id: 'lot1', avgEntryPrice: 100, status: 'OPEN', realizedPnl: 50 },
    { id: 'lot2', avgEntryPrice: 200, status: 'CLOSED', realizedPnl: 300 },
  ]
  const orders = [
    { id: 'close-today', side: 'SELL', closeLotId: 'lot1' },
    { id: 'close-old', side: 'SELL', closeLotId: 'lot2' },
    { id: 'entry', side: 'BUY', closeLotId: null },
  ]

  it('attributes only today IST close fills (not cumulative lot realized)', () => {
    // Partial close today on multi-day open lot: (105-100)*5 = 25
    // Old close fill ignored
    // Entry fill ignored
    const day = computeDayRealizedFromCloseFills(
      [
        {
          orderId: 'close-today',
          lotId: 'lot1',
          side: 'SELL',
          qty: 5,
          price: 105,
          createdAt: '2026-07-29T04:30:00.000Z', // 10:00 IST
        },
        {
          orderId: 'close-old',
          lotId: 'lot2',
          side: 'SELL',
          qty: 10,
          price: 230,
          createdAt: '2026-07-28T04:30:00.000Z',
        },
        {
          orderId: 'entry',
          lotId: 'lot1',
          side: 'BUY',
          qty: 10,
          price: 100,
          createdAt: '2026-07-29T03:00:00.000Z',
        },
      ],
      orders,
      lots,
      today,
    )
    expect(day).toBe(25)
  })

  it('does not dump full lot.realizedPnl on final close day', () => {
    // Lot had prior realized 300 cumulative; only today's fill (210-200)*2 = 20 counts
    const day = computeDayRealizedFromCloseFills(
      [
        {
          orderId: 'close-old',
          lotId: 'lot2',
          side: 'SELL',
          qty: 2,
          price: 210,
          createdAt: '2026-07-29T05:00:00.000Z',
        },
      ],
      orders,
      lots,
      today,
    )
    expect(day).toBe(20)
    // NOT 300
  })

  it('multi-day open lot partial today is included (undercount bug fix)', () => {
    const day = computeDayRealizedFromCloseFills(
      [
        {
          orderId: 'close-today',
          lotId: 'lot1',
          side: 'SELL',
          qty: 3,
          price: 110,
          createdAt: '2026-07-29T06:00:00.000Z',
        },
      ],
      orders,
      lots,
      today,
    )
    expect(day).toBe(30) // (110-100)*3
  })
})

describe('computePaperPnl day via fills', () => {
  it('wires day realized from options.fills/orders', () => {
    const s = computePaperPnl(
      [
        {
          id: 'lot1',
          status: 'OPEN',
          realizedPnl: 999, // must NOT become day realized
          unrealizedPnl: 40,
          avgEntryPrice: 50,
        },
      ],
      {
        todayKey: '2026-07-29',
        orders: [{ id: 'c1', side: 'SELL', closeLotId: 'lot1' }],
        fills: [
          {
            orderId: 'c1',
            lotId: 'lot1',
            qty: 2,
            price: 55,
            createdAt: '2026-07-29T04:00:00.000Z',
          },
        ],
      },
    )
    expect(s.dayRealized).toBe(10) // (55-50)*2
    expect(s.dayUnrealized).toBe(40)
    expect(s.dayTotal).toBe(50)
    expect(s.overallRealized).toBe(999)
  })
})

describe('istDateKey', () => {
  it('returns null for empty', () => {
    expect(istDateKey(null)).toBeNull()
    expect(istDateKey('')).toBeNull()
  })
})

describe('computeWinRate', () => {
  it('returns null winRate when empty or only open', () => {
    expect(computeWinRate([]).winRate).toBeNull()
    expect(
      computeWinRate([{ status: 'OPEN', realizedPnl: 10 }]).winRate,
    ).toBeNull()
  })

  it('excludes flats and non-CLOSED', () => {
    const s = computeWinRate([
      { status: 'CLOSED', realizedPnl: 100 },
      { status: 'CLOSED', realizedPnl: -50 },
      { status: 'CLOSED', realizedPnl: 0 },
      { status: 'OPEN', realizedPnl: 200 },
    ])
    expect(s.wins).toBe(1)
    expect(s.losses).toBe(1)
    expect(s.flats).toBe(1)
    expect(s.winRate).toBe(0.5)
  })

  it('formatWinRatePct', () => {
    expect(formatWinRatePct(null)).toBe('—')
    expect(formatWinRatePct(0.625)).toBe('62.5%')
  })
})

import { describe, expect, it } from 'vitest'
import {
  CTS_ENDED_MSG,
  failedBannerForEntry,
  infoAfterCandleLoad,
} from './sessionMessages'
import { MARKET_CLOSED_MSG } from './helpers'

describe('infoAfterCandleLoad', () => {
  it('reports closed market with and without candles', () => {
    expect(infoAfterCandleLoad([], 'closed')).toMatch(/Market is closed/)
    expect(infoAfterCandleLoad([{ time: 1 }], 'closed')).toBe(MARKET_CLOSED_MSG)
  })

  it('reports empty open-market history', () => {
    expect(infoAfterCandleLoad([], 'open')).toBe('No candle data available yet.')
    expect(infoAfterCandleLoad([{ time: 1 }], 'open')).toBeNull()
  })

  it('shows CAS CTS banner while global marketPhase is still open', () => {
    expect(
      infoAfterCandleLoad([{ time: 1 }], 'open', {
        sessionKind: 'cas_cash',
        ctsEnd: '15:15',
        nowMinutes: 15 * 60 + 16,
      }),
    ).toBe(CTS_ENDED_MSG.cas_cash)
    expect(
      infoAfterCandleLoad([{ time: 1 }], 'open', {
        sessionKind: 'cas_cash',
        ctsEnd: '15:15',
        nowMinutes: 15 * 60 + 10,
      }),
    ).toBeNull()
    expect(
      infoAfterCandleLoad([{ time: 1 }], 'open', {
        sessionKind: 'index',
        ctsEnd: '15:15',
        nowMinutes: 15 * 60 + 20,
      }),
    ).toBe(CTS_ENDED_MSG.index)
  })
})

describe('failedBannerForEntry', () => {
  it('returns null when not failed', () => {
    expect(failedBannerForEntry({ bootstrapStatus: 'READY' })).toBeNull()
    expect(failedBannerForEntry(null)).toBeNull()
  })

  it('returns bootstrap error for FAILED', () => {
    expect(
      failedBannerForEntry({
        bootstrapStatus: 'FAILED',
        bootstrapError: 'no token',
        tradingSymbol: 'RELIANCE',
      }),
    ).toBe('no token')
  })
})

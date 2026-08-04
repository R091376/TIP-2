import { describe, expect, it } from 'vitest'
import { isPaperTradableEntry, paperTradeDisabledReason } from './paperTradable'

const eqReady = {
  symbolId: 'NSE_EQ|INE002A01018',
  segment: 'NSE_EQ',
  instrumentType: 'EQ',
  bootstrapStatus: 'READY',
  active: true,
}

describe('paperTradeDisabledReason', () => {
  it('no symbol → Select a symbol', () => {
    expect(paperTradeDisabledReason(null)).toBe('Select a symbol')
    expect(paperTradeDisabledReason(undefined)).toBe('Select a symbol')
    expect(paperTradeDisabledReason({})).toBe('Select a symbol')
    expect(paperTradeDisabledReason({ symbolId: '' })).toBe('Select a symbol')
  })

  it('tradingEnabled false → Trading disabled for your account', () => {
    expect(
      paperTradeDisabledReason(eqReady, { tradingEnabled: false }),
    ).toBe('Trading disabled for your account')
  })

  it('inactive → Symbol not active', () => {
    expect(
      paperTradeDisabledReason({ ...eqReady, active: false }, { tradingEnabled: true }),
    ).toBe('Symbol not active')
  })

  it('REMOVING → Symbol not active', () => {
    expect(
      paperTradeDisabledReason(
        { ...eqReady, bootstrapStatus: 'REMOVING' },
        { tradingEnabled: true },
      ),
    ).toBe('Symbol not active')
  })

  it('FAILED → Symbol not ready', () => {
    expect(
      paperTradeDisabledReason(
        { ...eqReady, bootstrapStatus: 'FAILED' },
        { tradingEnabled: true },
      ),
    ).toBe('Symbol not ready')
  })

  it('index / non-EQ → index not tradeable message', () => {
    const msg = 'Index not tradeable'
    expect(
      paperTradeDisabledReason(
        {
          symbolId: 'NSE_INDEX|Nifty 50',
          segment: 'NSE_INDEX',
          instrumentType: 'INDEX',
          bootstrapStatus: 'READY',
          active: true,
        },
        { tradingEnabled: true },
      ),
    ).toBe(msg)

    expect(
      paperTradeDisabledReason(
        {
          symbolId: 'NSE_EQ|FOO',
          segment: 'NSE_FO',
          instrumentType: 'FUT',
          bootstrapStatus: 'READY',
          active: true,
        },
        { tradingEnabled: true },
      ),
    ).toBe(msg)

    expect(
      paperTradeDisabledReason(
        {
          symbolId: 'NSE_EQ|BAR',
          segment: 'NSE_EQ',
          instrumentType: 'ETF',
          bootstrapStatus: 'READY',
          active: true,
        },
        { tradingEnabled: true },
      ),
    ).toBe(msg)
  })

  it('valid EQ active READY → empty (enabled)', () => {
    expect(paperTradeDisabledReason(eqReady, { tradingEnabled: true })).toBe('')
    expect(paperTradeDisabledReason(eqReady)).toBe('')
    expect(
      paperTradeDisabledReason(
        { ...eqReady, instrumentType: 'BE', bootstrapStatus: 'PENDING' },
        { tradingEnabled: true },
      ),
    ).toBe('')
  })

  it('prefers earlier reasons over later ones (order)', () => {
    // trading disabled wins over inactive / index
    expect(
      paperTradeDisabledReason(
        {
          symbolId: 'NSE_INDEX|X',
          segment: 'NSE_INDEX',
          active: false,
          bootstrapStatus: 'FAILED',
        },
        { tradingEnabled: false },
      ),
    ).toBe('Trading disabled for your account')

    // inactive wins over FAILED / index
    expect(
      paperTradeDisabledReason(
        {
          symbolId: 'NSE_INDEX|X',
          segment: 'NSE_INDEX',
          active: false,
          bootstrapStatus: 'FAILED',
        },
        { tradingEnabled: true },
      ),
    ).toBe('Symbol not active')
  })
})

describe('isPaperTradableEntry', () => {
  it('FAILED blocked by default', () => {
    expect(
      isPaperTradableEntry({ ...eqReady, bootstrapStatus: 'FAILED' }),
    ).toBe(false)
    expect(
      isPaperTradableEntry(
        { ...eqReady, bootstrapStatus: 'FAILED' },
        { treatFailedAsBlocked: true },
      ),
    ).toBe(false)
  })

  it('FAILED allowed when treatFailedAsBlocked false', () => {
    expect(
      isPaperTradableEntry(
        { ...eqReady, bootstrapStatus: 'FAILED' },
        { treatFailedAsBlocked: false },
      ),
    ).toBe(true)
  })

  it('PENDING allowed if otherwise tradable', () => {
    expect(
      isPaperTradableEntry({ ...eqReady, bootstrapStatus: 'PENDING' }),
    ).toBe(true)
  })

  it('rejects REMOVING, inactive, index, non-EQ', () => {
    expect(
      isPaperTradableEntry({ ...eqReady, bootstrapStatus: 'REMOVING' }),
    ).toBe(false)
    expect(isPaperTradableEntry({ ...eqReady, active: false })).toBe(false)
    expect(isPaperTradableEntry(null)).toBe(false)
    expect(
      isPaperTradableEntry({
        ...eqReady,
        segment: 'NSE_INDEX',
        symbolId: 'NSE_INDEX|Nifty 50',
      }),
    ).toBe(false)
    expect(
      isPaperTradableEntry({ ...eqReady, instrumentType: 'FUT' }),
    ).toBe(false)
  })

  it('accepts BE on NSE_EQ', () => {
    expect(
      isPaperTradableEntry({ ...eqReady, instrumentType: 'BE' }),
    ).toBe(true)
  })
})

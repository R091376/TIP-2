import { describe, expect, it } from 'vitest'
import { mergePanelIntoSearch, parsePanel, stripPanelFromSearch } from './panelDeepLink'

describe('parsePanel', () => {
  it('accepts watchlist and alerts', () => {
    expect(parsePanel('?panel=watchlist')).toBe('watchlist')
    expect(parsePanel('panel=alerts')).toBe('alerts')
    expect(parsePanel(new URLSearchParams('panel=WATCHLIST'))).toBe('watchlist')
  })

  it('ignores unknown / missing', () => {
    expect(parsePanel('?panel=foo')).toBe(null)
    expect(parsePanel('?symbol=X')).toBe(null)
    expect(parsePanel('')).toBe(null)
  })
})

describe('stripPanelFromSearch', () => {
  it('keeps symbol and tf', () => {
    expect(stripPanelFromSearch('?symbol=A&tf=5m&panel=watchlist')).toBe('?symbol=A&tf=5m')
    expect(stripPanelFromSearch('?panel=alerts')).toBe('')
  })
})

describe('mergePanelIntoSearch', () => {
  it('merges without dropping params', () => {
    expect(mergePanelIntoSearch('?symbol=X&tf=1h', 'alerts')).toBe(
      '?symbol=X&tf=1h&panel=alerts',
    )
  })
})

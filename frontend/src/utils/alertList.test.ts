import { describe, expect, it } from 'vitest'
import { appendAlert, collectPinnedInstanceIds, compactAlerts } from './alertList'

describe('collectPinnedInstanceIds', () => {
  it('includes focused and remembered instance ids', () => {
    const mem = new Map([
      ['NSE:RELIANCE|5m', { instanceId: 'inst-a' }],
      ['NSE:TCS|5m', { instanceId: 'inst-b' }],
    ])
    expect(collectPinnedInstanceIds('inst-focus', mem).sort()).toEqual(
      ['inst-a', 'inst-b', 'inst-focus'].sort(),
    )
  })

  it('handles empty inputs', () => {
    expect(collectPinnedInstanceIds(null, null)).toEqual([])
    expect(collectPinnedInstanceIds(undefined, new Map())).toEqual([])
  })
})

describe('compactAlerts', () => {
  it('returns empty for empty list', () => {
    expect(compactAlerts([])).toEqual([])
    expect(compactAlerts(null)).toEqual([])
  })

  it('always keeps pinned instances even when over budget', () => {
    const list = [
      { id: '1', instanceId: 'pin' },
      { id: '2', instanceId: 'pin' },
      { id: '3', instanceId: 'other' },
      { id: '4', instanceId: 'other2' },
    ]
    const out = compactAlerts(list, { max: 2, pinnedInstanceIds: ['pin'] })
    expect(out.map((a) => a.id)).toEqual(['1', '2'])
  })

  it('fills remaining budget with non-pinned', () => {
    const list = [
      { id: '1', instanceId: 'pin' },
      { id: '2', instanceId: 'a' },
      { id: '3', instanceId: 'b' },
      { id: '4', instanceId: 'c' },
    ]
    const out = compactAlerts(list, { max: 3, pinnedInstanceIds: ['pin'] })
    expect(out.map((a) => a.id)).toEqual(['1', '2', '3'])
  })
})

describe('appendAlert', () => {
  it('prepends and dedupes by id', () => {
    const prev = [{ id: 'a', instanceId: 'x' }]
    const next = appendAlert(prev, { id: 'b', instanceId: 'y' })
    expect(next.map((a) => a.id)).toEqual(['b', 'a'])
    expect(appendAlert(next, { id: 'a', instanceId: 'x' })).toBe(next)
  })

  it('ignores null alert', () => {
    const prev = [{ id: 'a' }]
    expect(appendAlert(prev, null)).toBe(prev)
  })
})

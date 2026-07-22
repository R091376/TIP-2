import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./http', () => ({
  api: vi.fn(),
}))

import { api } from './http'
import { fetchPatternStatistics } from './patternStatisticsApi'

describe('fetchPatternStatistics', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset()
  })

  it('calls bulk endpoint without query when no filters', async () => {
    vi.mocked(api).mockResolvedValue({ minSampleSize: 20, count: 0, items: [] })
    const res = await fetchPatternStatistics()
    expect(api).toHaveBeenCalledWith('/api/pattern-statistics')
    expect(res.items).toEqual([])
    expect(res.minSampleSize).toBe(20)
  })

  it('appends patternType and timeframe query params', async () => {
    vi.mocked(api).mockResolvedValue({
      minSampleSize: 20,
      count: 1,
      items: [{ status: 'ok', symbolId: 'NSE_EQ|X', patternType: 'breakout', timeframe: '5m' }],
    })
    await fetchPatternStatistics({ patternType: 'breakout', timeframe: '5m' })
    expect(api).toHaveBeenCalledWith(
      '/api/pattern-statistics?patternType=breakout&timeframe=5m',
    )
  })

  it('normalizes missing items array', async () => {
    vi.mocked(api).mockResolvedValue({ minSampleSize: 20, count: 0 } as never)
    const res = await fetchPatternStatistics()
    expect(res.items).toEqual([])
  })
})

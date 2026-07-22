import { describe, expect, it } from 'vitest'
import { utcToNseChartTime } from './chartTime'

describe('utcToNseChartTime', () => {
  it('returns 0 for non-finite input', () => {
    expect(utcToNseChartTime(NaN)).toBe(0)
    expect(utcToNseChartTime(undefined)).toBe(0)
    expect(utcToNseChartTime(null)).toBe(0)
    expect(utcToNseChartTime('nope')).toBe(0)
  })

  it('shifts UTC epoch so LWC wall-clock shows IST', () => {
    // 2024-01-15 09:15:00 IST = 2024-01-15 03:45:00 UTC
    const utcSeconds = Math.floor(Date.UTC(2024, 0, 15, 3, 45, 0) / 1000)
    const chartTime = utcToNseChartTime(utcSeconds)
    // Chart time should display as 09:15 when interpreted as UTC by LWC
    const d = new Date(chartTime * 1000)
    expect(d.getUTCHours()).toBe(9)
    expect(d.getUTCMinutes()).toBe(15)
    expect(d.getUTCDate()).toBe(15)
  })

  it('handles string numeric input', () => {
    const utcSeconds = Math.floor(Date.UTC(2024, 5, 1, 4, 0, 0) / 1000)
    expect(utcToNseChartTime(String(utcSeconds))).toBe(utcToNseChartTime(utcSeconds))
  })
})

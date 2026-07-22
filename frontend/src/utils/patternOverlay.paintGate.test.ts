import { describe, expect, it } from 'vitest'
import { seriesKey, willRestoreOverlay } from './patternOverlay'

/**
 * Documents the load gate: loaded series key must match before paint is allowed.
 * Empty candles are gated inside usePatternOverlay.paintOverlayIfReady.
 */
describe('overlay load gate helpers', () => {
  it('seriesKey is null until both parts exist', () => {
    expect(seriesKey('A', null)).toBeNull()
    expect(seriesKey('A', '5m')).toBe('A|5m')
  })

  it('willRestoreOverlay keeps pending while series matches', () => {
    expect(
      willRestoreOverlay({ symbolId: 'A', timeframe: '5m' }, null, 'A', '5m'),
    ).toBe(true)
    // After clearSeriesDataFor, callers leave pending; paint refuses without candles/key
    expect(
      willRestoreOverlay({ symbolId: 'A', timeframe: '5m' }, null, 'A', '1h'),
    ).toBe(false)
  })
})

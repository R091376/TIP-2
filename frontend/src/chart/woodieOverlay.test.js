import { describe, expect, it, vi } from 'vitest'
import { applyWoodieOverlay, timeToX } from './woodieOverlay'
import { nseSessionUtcSeconds } from '../utils/woodieSr'

describe('timeToX', () => {
  it('uses timeToCoordinate when the time is an exact bar', () => {
    const ts = {
      timeToCoordinate: (t) => (t === 100 ? 40 : null),
      timeToIndex: () => 3,
      logicalToCoordinate: () => 99,
    }
    expect(timeToX(ts, 100)).toBe(40)
  })

  it('falls back to LWC v5 logicalToCoordinate, not indexToCoordinate', () => {
    const ts = {
      timeToCoordinate: () => null,
      timeToIndex: (t, nearest) => {
        expect(nearest).toBe(true)
        expect(t).toBe(200)
        return 7
      },
      logicalToCoordinate: (idx) => (idx === 7 ? 55 : null),
    }
    expect(timeToX(ts, 200)).toBe(55)
  })

  it('does not throw when indexToCoordinate is missing (LWC v5)', () => {
    const ts = {
      timeToCoordinate: () => null,
      timeToIndex: () => 2,
    }
    expect(ts.indexToCoordinate).toBeUndefined()
    expect(() => timeToX(ts, 15)).not.toThrow()
    expect(timeToX(ts, 15)).toBeNull()
  })

  it('uses indexToCoordinate only if logicalToCoordinate is absent', () => {
    const ts = {
      timeToCoordinate: () => null,
      timeToIndex: () => 4,
      indexToCoordinate: (idx) => (idx === 4 ? 12 : null),
    }
    expect(timeToX(ts, 1)).toBe(12)
  })

  it('returns null for a missing time scale', () => {
    expect(timeToX(null, 1)).toBeNull()
    expect(timeToX(undefined, 1)).toBeNull()
  })
})

describe('WoodieRenderer draw safety', () => {
  it('does not throw through useBitmapCoordinateSpace on a v5 time scale', () => {
    const ts = {
      timeToCoordinate: () => null,
      timeToIndex: () => 0,
      logicalToCoordinate: () => 10,
      options: () => ({ barSpacing: 6 }),
      width: () => 400,
    }
    const chart = { timeScale: () => ts }
    const primitiveHolder = { current: null }
    const series = {
      attachPrimitive(p) {
        primitiveHolder.current = p
        p.attached({ chart, series, requestUpdate: () => {} })
      },
      detachPrimitive() {},
      priceToCoordinate: () => 20,
    }
    applyWoodieOverlay(
      chart,
      series,
      [
        {
          sessionDate: '2026-08-17',
          pp: 100,
          s3: 97,
          s2: 98,
          s1: 99,
          r1: 101,
          r2: 102,
          r3: 103,
        },
      ],
      {
        candles: [
          {
            time: nseSessionUtcSeconds('2026-08-17', 9, 15),
            open: 100,
            high: 101,
            low: 99,
            close: 100,
          },
        ],
        ctsHour: 15,
        ctsMinute: 15,
      },
    )
    const primitive = primitiveHolder.current
    expect(primitive).toBeTruthy()
    const view = primitive.paneViews()[0]
    const renderer = view.renderer()
    const target = {
      useBitmapCoordinateSpace: vi.fn((cb) => {
        cb({
          context: {
            save() {},
            restore() {},
            beginPath() {},
            moveTo() {},
            lineTo() {},
            stroke() {},
            setLineDash() {},
            lineWidth: 1,
            lineCap: 'butt',
            strokeStyle: '',
          },
          horizontalPixelRatio: 1,
          verticalPixelRatio: 1,
        })
      }),
    }
    expect(() => renderer.draw(target)).not.toThrow()
    expect(target.useBitmapCoordinateSpace).toHaveBeenCalled()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { measureVisualViewport, syncVisualViewportVars } from './viewport'

function stubWindow(partial: Record<string, unknown>) {
  const base = {
    innerWidth: 1024,
    innerHeight: 768,
    visualViewport: null as unknown,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    },
    cancelAnimationFrame: vi.fn(),
    ...partial,
  }
  vi.stubGlobal('window', base)
  // measureVisualViewport reads window.* via global window
  Object.assign(globalThis, { window: base, innerWidth: base.innerWidth, innerHeight: base.innerHeight })
  if ('visualViewport' in partial) {
    Object.defineProperty(globalThis, 'visualViewport', {
      value: partial.visualViewport,
      configurable: true,
    })
  }
}

describe('measureVisualViewport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses visualViewport when available', () => {
    const vv = {
      width: 390.4,
      height: 664.7,
      offsetTop: 12.2,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    stubWindow({ visualViewport: vv })
    // Access path is window.visualViewport
    expect(measureVisualViewport()).toEqual({
      width: 390,
      height: 665,
      offsetTop: 12,
    })
  })

  it('falls back to innerWidth/innerHeight', () => {
    stubWindow({ visualViewport: null, innerWidth: 800, innerHeight: 600 })
    expect(measureVisualViewport()).toEqual({
      width: 800,
      height: 600,
      offsetTop: 0,
    })
  })
})

describe('syncVisualViewportVars', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('writes CSS custom properties on documentElement', () => {
    const props = new Map<string, string>()
    const fakeRoot = {
      style: {
        setProperty: (k: string, v: string) => {
          props.set(k, v)
        },
        getPropertyValue: (k: string) => props.get(k) ?? '',
        removeProperty: (k: string) => {
          props.delete(k)
        },
      },
    }
    vi.stubGlobal('document', { documentElement: fakeRoot })
    stubWindow({
      visualViewport: {
        width: 375,
        height: 700,
        offsetTop: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    })
    syncVisualViewportVars()
    expect(props.get('--app-vh')).toBe('700px')
    expect(props.get('--app-vw')).toBe('375px')
    expect(props.get('--app-vv-offset-top')).toBe('0px')
  })
})

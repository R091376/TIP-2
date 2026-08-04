/**
 * Keep CSS --app-vh / --app-vw in sync with the *visual* viewport.
 *
 * Mobile browsers (iOS Safari, Chrome Android) change the visible area when
 * the URL bar shows/hides. 100vh / 100dvh / height:100% often disagree with
 * what the user actually sees, which produces:
 *   - a few pixels of document scroll to reveal top/bottom chrome
 *   - black gaps at rounded screen corners
 *   - bottom nav or headers clipped under browser chrome
 *
 * visualViewport.height is the reliable measure of the on-screen area.
 */

const ROOT = () => document.documentElement

export function measureVisualViewport(): { width: number; height: number; offsetTop: number } {
  const vv = window.visualViewport
  if (vv) {
    return {
      width: Math.round(vv.width),
      height: Math.round(vv.height),
      offsetTop: Math.round(vv.offsetTop),
    }
  }
  return {
    width: Math.round(window.innerWidth),
    height: Math.round(window.innerHeight),
    offsetTop: 0,
  }
}

export function syncVisualViewportVars(): void {
  const { width, height, offsetTop } = measureVisualViewport()
  const root = ROOT()
  root.style.setProperty('--app-vh', `${height}px`)
  root.style.setProperty('--app-vw', `${width}px`)
  root.style.setProperty('--app-vv-offset-top', `${offsetTop}px`)
}

/**
 * Install listeners once. Safe to call from main.jsx on every load.
 * Returns a disposer for tests / HMR.
 */
export function installVisualViewportSync(): () => void {
  let raf = 0
  const schedule = () => {
    if (raf) return
    raf = window.requestAnimationFrame(() => {
      raf = 0
      syncVisualViewportVars()
    })
  }

  syncVisualViewportVars()

  window.addEventListener('resize', schedule)
  window.addEventListener('orientationchange', schedule)
  // iOS fires these when the URL bar collapses/expands
  window.visualViewport?.addEventListener('resize', schedule)
  window.visualViewport?.addEventListener('scroll', schedule)

  return () => {
    if (raf) window.cancelAnimationFrame(raf)
    window.removeEventListener('resize', schedule)
    window.removeEventListener('orientationchange', schedule)
    window.visualViewport?.removeEventListener('resize', schedule)
    window.visualViewport?.removeEventListener('scroll', schedule)
  }
}

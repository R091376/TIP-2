/**
 * Abort / timeout helpers for startup and session probes.
 */

/** Reject with AbortError when any of the signals abort. */
export function anyAbortSignal(
  signals: Array<AbortSignal | undefined | null>,
): AbortSignal {
  const list = signals.filter((s): s is AbortSignal => !!s)
  if (list.length === 0) {
    return new AbortController().signal
  }
  if (list.length === 1) return list[0]
  // Prefer native when available (Chromium 116+, Safari 17.4+, Firefox 124+)
  const anyFn = (
    AbortSignal as unknown as {
      any?: (signals: AbortSignal[]) => AbortSignal
    }
  ).any
  if (typeof anyFn === 'function') {
    return anyFn.call(AbortSignal, list)
  }
  const ac = new AbortController()
  const onAbort = () => {
    if (!ac.signal.aborted) ac.abort()
  }
  for (const s of list) {
    if (s.aborted) {
      onAbort()
      return ac.signal
    }
    s.addEventListener('abort', onAbort, { once: true })
  }
  return ac.signal
}

/** Signal that aborts after `ms` (and when `parent` aborts, if provided). */
export function timeoutSignal(
  ms: number,
  parent?: AbortSignal | null,
): { signal: AbortSignal; clear: () => void } {
  const ac = new AbortController()
  const timer = setTimeout(() => {
    if (!ac.signal.aborted) ac.abort()
  }, Math.max(0, ms))

  const onParent = () => {
    clearTimeout(timer)
    if (!ac.signal.aborted) ac.abort()
  }
  if (parent) {
    if (parent.aborted) {
      clearTimeout(timer)
      ac.abort()
    } else {
      parent.addEventListener('abort', onParent, { once: true })
    }
  }

  return {
    signal: ac.signal,
    clear: () => {
      clearTimeout(timer)
      parent?.removeEventListener('abort', onParent)
    },
  }
}

export function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === 'AbortError') ||
    (e instanceof Error && e.name === 'AbortError')
  )
}

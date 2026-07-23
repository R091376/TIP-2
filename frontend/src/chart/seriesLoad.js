/**
 * Shared bootstrap-gate + candle load helpers for chart navigation / pending poll.
 * Keeps FAILED / PENDING / READY behavior consistent without copy-pasted branches.
 */
import { normalizeStatus } from './helpers'
import { failedBannerForEntry, infoAfterCandleLoad } from './sessionMessages'

/** @returns {'failed' | 'pending' | 'ready'} */
export function bootstrapGate(entry) {
  const status = normalizeStatus(entry?.bootstrapStatus)
  if (status === 'FAILED') return 'failed'
  if (status === 'PENDING') return 'pending'
  return 'ready'
}

/**
 * Handle FAILED or PENDING: banner/info + subscribe. Returns true if handled (not READY).
 * @returns {boolean}
 */
export function handleNonReadyBootstrap({
  entry,
  symbolId,
  timeframe,
  socketRef,
  setError,
  setInfoMessage,
}) {
  const gate = bootstrapGate(entry)
  if (gate === 'failed') {
    const msg = failedBannerForEntry(entry)
    if (msg) setError(msg)
    socketRef.current?.subscribe(symbolId, timeframe)
    return true
  }
  if (gate === 'pending') {
    setInfoMessage('Loading market data…')
    socketRef.current?.subscribe(symbolId, timeframe)
    return true
  }
  return false
}

/**
 * Load historical candles for a READY series, then subscribe live.
 * Generation-guards errors and optional setSwitching cleanup.
 *
 * @returns {Promise<'ok' | 'stale' | 'error'>}
 */
export async function loadReadySeries({
  symbolId,
  timeframe,
  generation,
  loadGenerationRef,
  loadCandles,
  marketPhaseRef,
  socketRef,
  setInfoMessage,
  setError,
  setSwitching = null,
  errorFallback = 'Failed to load',
  /** When true, prefer failedBannerForEntry(active) over raw error message */
  preferFailedBanner = false,
  watchlistRef = null,
  disposedRef = null,
}) {
  try {
    const candles = await loadCandles(symbolId, timeframe, generation)
    if (candles === null || disposedRef?.current) return 'stale'
    setInfoMessage(infoAfterCandleLoad(candles, marketPhaseRef.current))
    socketRef.current?.subscribe(symbolId, timeframe)
    return 'ok'
  } catch (err) {
    if (generation === loadGenerationRef.current && !disposedRef?.current) {
      if (preferFailedBanner && watchlistRef) {
        const active = watchlistRef.current.find((e) => e.symbolId === symbolId)
        setError(
          failedBannerForEntry(active) ||
            (err instanceof Error ? err.message : errorFallback),
        )
      } else {
        setError(err instanceof Error ? err.message : errorFallback)
      }
    }
    return 'error'
  } finally {
    if (setSwitching && generation === loadGenerationRef.current) {
      setSwitching(false)
    }
  }
}

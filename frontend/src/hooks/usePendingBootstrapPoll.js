/**
 * Polls watchlist while any entry is PENDING; loads candles when active becomes READY.
 */
import { useEffect } from 'react'
import { fetchWatchlist } from '../services/watchlistApi'
import { MARKET_CLOSED_MSG, normalizeStatus } from '../chart/helpers'
import { failedBannerForEntry, infoAfterCandleLoad } from '../chart/sessionMessages'

export function usePendingBootstrapPoll({
  needsPendingPoll,
  disposedRef,
  watchlistRef,
  activeSymbolIdRef,
  timeframeRef,
  loadGenerationRef,
  marketPhaseRef,
  socketRef,
  setWatchlist,
  setSwitching,
  setError,
  setInfoMessage,
  loadCandles,
}) {
  useEffect(() => {
    if (!needsPendingPoll) return
    let stopped = false
    let timer = null

    async function recoverActiveIfReady(prevActive, nextActive) {
      const prevStatus = normalizeStatus(prevActive?.bootstrapStatus)
      const nextStatus = normalizeStatus(nextActive.bootstrapStatus)
      if (prevStatus === 'PENDING' && nextStatus === 'READY') {
        const generation = ++loadGenerationRef.current
        setSwitching(true)
        setError(null)
        setInfoMessage(null)
        try {
          const candles = await loadCandles(
            nextActive.symbolId,
            timeframeRef.current,
            generation,
          )
          if (candles === null || disposedRef.current) return
          setInfoMessage(infoAfterCandleLoad(candles, marketPhaseRef.current))
          socketRef.current?.subscribe(nextActive.symbolId, timeframeRef.current)
        } catch (err) {
          if (generation === loadGenerationRef.current && !disposedRef.current)
            setError(err instanceof Error ? err.message : 'Failed to load candles')
        } finally {
          if (generation === loadGenerationRef.current) setSwitching(false)
        }
      } else if (prevStatus === 'PENDING' && nextStatus === 'FAILED') {
        const msg = failedBannerForEntry(nextActive)
        if (msg) setError(msg)
        setInfoMessage(null)
      } else if (nextStatus === 'PENDING') {
        setInfoMessage((m) => (m === MARKET_CLOSED_MSG ? m : 'Loading market data…'))
      }
    }

    async function pollPending() {
      if (stopped || disposedRef.current) return
      if (!watchlistRef.current.some((e) => normalizeStatus(e.bootstrapStatus) === 'PENDING'))
        return
      try {
        const entries = await fetchWatchlist()
        if (stopped || disposedRef.current) return
        const prev = watchlistRef.current
        setWatchlist(entries)
        watchlistRef.current = entries
        const activeId = activeSymbolIdRef.current
        if (activeId) {
          const prevActive = prev.find((e) => e.symbolId === activeId)
          const nextActive = entries.find((e) => e.symbolId === activeId)
          if (nextActive) void recoverActiveIfReady(prevActive, nextActive)
        }
      } catch {
        /* transient */
      }
      if (!stopped && !disposedRef.current) timer = setTimeout(pollPending, 1000)
    }

    timer = setTimeout(pollPending, 1000)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [
    needsPendingPoll,
    disposedRef,
    watchlistRef,
    activeSymbolIdRef,
    timeframeRef,
    loadGenerationRef,
    marketPhaseRef,
    socketRef,
    setWatchlist,
    setSwitching,
    setError,
    setInfoMessage,
    loadCandles,
  ])
}

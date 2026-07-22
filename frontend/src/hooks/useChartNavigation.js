/**
 * Symbol / timeframe / alert / watchlist mutation handlers for the chart page.
 */
import { useCallback } from 'react'
import { addSymbol, fetchWatchlist, removeSymbol } from '../services/watchlistApi'
import { normalizeStatus } from '../chart/helpers'
import { failedBannerForEntry, infoAfterCandleLoad } from '../chart/sessionMessages'

/**
 * @param {object} ctx shared refs/state setters + engine + overlay
 */
export function useChartNavigation(ctx) {
  const {
    loading,
    adding,
    setAdding,
    timeframe,
    activeSymbolId,
    setActiveSymbolId,
    setTimeframe,
    setWatchlist,
    setSwitching,
    setError,
    setInfoMessage,
    setOhlcLegend,
    chartTypeRef,
    timeframeRef,
    activeSymbolIdRef,
    watchlistRef,
    loadGenerationRef,
    marketPhaseRef,
    socketRef,
    candlesRef,
    seriesRef,
    loadedSeriesKeyRef,
    ohlcHoveringRef,
    loadCandles,
    applySeriesData,
    clearSeriesDataFor,
    overlay,
  } = ctx

  const switchToSymbol = useCallback(
    async (nextSymbolId, entryHint = null, { force = false } = {}) => {
      if (!nextSymbolId || loading) return
      if (!force && nextSymbolId === activeSymbolIdRef.current) return
      overlay.beginSeriesNavigation(nextSymbolId, timeframeRef.current)
      const generation = ++loadGenerationRef.current
      setSwitching(true)
      setError(null)
      setInfoMessage(null)
      ohlcHoveringRef.current = false
      setOhlcLegend(null)
      const entry =
        entryHint || watchlistRef.current.find((e) => e.symbolId === nextSymbolId) || null
      setActiveSymbolId(nextSymbolId)
      activeSymbolIdRef.current = nextSymbolId
      clearSeriesDataFor(nextSymbolId, timeframeRef.current)

      if (normalizeStatus(entry?.bootstrapStatus) === 'FAILED') {
        const msg = failedBannerForEntry(entry)
        if (msg) setError(msg)
        socketRef.current?.subscribe(nextSymbolId, timeframeRef.current)
        if (generation === loadGenerationRef.current) setSwitching(false)
        return
      }
      if (normalizeStatus(entry?.bootstrapStatus) === 'PENDING') {
        setInfoMessage('Loading market data…')
        socketRef.current?.subscribe(nextSymbolId, timeframeRef.current)
        if (generation === loadGenerationRef.current) setSwitching(false)
        return
      }
      try {
        const candles = await loadCandles(nextSymbolId, timeframeRef.current, generation)
        if (candles === null) return
        setInfoMessage(infoAfterCandleLoad(candles, marketPhaseRef.current))
        socketRef.current?.subscribe(nextSymbolId, timeframeRef.current)
      } catch (err) {
        if (generation === loadGenerationRef.current)
          setError(err instanceof Error ? err.message : 'Failed to load symbol')
      } finally {
        if (generation === loadGenerationRef.current) setSwitching(false)
      }
    },
    [
      loading,
      overlay,
      activeSymbolIdRef,
      timeframeRef,
      loadGenerationRef,
      setSwitching,
      setError,
      setInfoMessage,
      ohlcHoveringRef,
      setOhlcLegend,
      watchlistRef,
      setActiveSymbolId,
      clearSeriesDataFor,
      socketRef,
      loadCandles,
      marketPhaseRef,
    ],
  )

  const handleSymbolChange = useCallback(
    (nextSymbolId) => {
      if (adding || loading) return
      if (!nextSymbolId || nextSymbolId === activeSymbolIdRef.current) return
      return switchToSymbol(nextSymbolId)
    },
    [adding, loading, activeSymbolIdRef, switchToSymbol],
  )

  const handleTimeframeChange = useCallback(
    async (nextTf) => {
      if (nextTf === timeframe || loading || !activeSymbolId || adding) return
      overlay.beginSeriesNavigation(activeSymbolIdRef.current, nextTf)
      setTimeframe(nextTf)
      timeframeRef.current = nextTf
      const entry =
        watchlistRef.current.find((e) => e.symbolId === activeSymbolIdRef.current) || null
      clearSeriesDataFor(activeSymbolIdRef.current, nextTf)
      if (normalizeStatus(entry?.bootstrapStatus) === 'FAILED') {
        ++loadGenerationRef.current
        const msg = failedBannerForEntry(entry)
        if (msg) setError(msg)
        socketRef.current?.subscribe(activeSymbolIdRef.current, nextTf)
        return
      }
      if (normalizeStatus(entry?.bootstrapStatus) === 'PENDING') {
        ++loadGenerationRef.current
        setInfoMessage('Loading market data…')
        socketRef.current?.subscribe(activeSymbolIdRef.current, nextTf)
        return
      }
      const generation = ++loadGenerationRef.current
      setSwitching(true)
      setError(null)
      try {
        const candles = await loadCandles(activeSymbolIdRef.current, nextTf, generation)
        if (candles === null) return
        setInfoMessage(infoAfterCandleLoad(candles, marketPhaseRef.current))
        socketRef.current?.subscribe(activeSymbolIdRef.current, nextTf)
      } catch (err) {
        if (generation === loadGenerationRef.current) {
          const active = watchlistRef.current.find(
            (e) => e.symbolId === activeSymbolIdRef.current,
          )
          setError(
            failedBannerForEntry(active) ||
              (err instanceof Error ? err.message : 'Failed to load timeframe'),
          )
        }
      } finally {
        if (generation === loadGenerationRef.current) setSwitching(false)
      }
    },
    [
      timeframe,
      loading,
      activeSymbolId,
      adding,
      overlay,
      activeSymbolIdRef,
      setTimeframe,
      timeframeRef,
      watchlistRef,
      clearSeriesDataFor,
      loadGenerationRef,
      setError,
      setInfoMessage,
      socketRef,
      setSwitching,
      loadCandles,
      marketPhaseRef,
    ],
  )

  const handleAlertSelect = useCallback(
    async (alert) => {
      if (!alert || loading || adding) return
      const entry = watchlistRef.current.find((e) => e.symbolId === alert.symbolId) || null
      if (!entry) {
        setError('Symbol is not on the watchlist for this alert.')
        overlay.setFocusSelection(alert)
        overlay.clearPendingAlert()
        return
      }
      if (
        activeSymbolIdRef.current &&
        timeframeRef.current &&
        (alert.symbolId !== activeSymbolIdRef.current ||
          alert.timeframe !== timeframeRef.current)
      ) {
        overlay.rememberOverlay(
          activeSymbolIdRef.current,
          timeframeRef.current,
          overlay.focusedInstanceIdRef.current,
          overlay.selectedAlertIdRef.current,
        )
      }
      overlay.setFocusSelection(alert)
      overlay.setPendingAlert(alert)
      overlay.rememberOverlay(alert.symbolId, alert.timeframe, alert.instanceId, alert.id)

      if (
        alert.symbolId === activeSymbolIdRef.current &&
        alert.timeframe === timeframeRef.current
      ) {
        overlay.paintOverlayIfReady(alert)
        overlay.clearPendingAlert()
        return
      }

      if (normalizeStatus(entry.bootstrapStatus) === 'FAILED') {
        const msg = failedBannerForEntry(entry)
        if (msg) setError(msg)
        setActiveSymbolId(alert.symbolId)
        activeSymbolIdRef.current = alert.symbolId
        setTimeframe(alert.timeframe)
        timeframeRef.current = alert.timeframe
        candlesRef.current.clear()
        loadedSeriesKeyRef.current = null
        overlay.wipeOverlay()
        if (seriesRef.current)
          applySeriesData(seriesRef.current, chartTypeRef.current, { restoreOverlay: false })
        socketRef.current?.subscribe(alert.symbolId, alert.timeframe)
        overlay.clearPendingAlert()
        return
      }

      const generation = ++loadGenerationRef.current
      setSwitching(true)
      setError(null)
      setInfoMessage(null)
      ohlcHoveringRef.current = false
      setOhlcLegend(null)
      setActiveSymbolId(alert.symbolId)
      activeSymbolIdRef.current = alert.symbolId
      setTimeframe(alert.timeframe)
      timeframeRef.current = alert.timeframe
      clearSeriesDataFor(alert.symbolId, alert.timeframe)

      if (normalizeStatus(entry.bootstrapStatus) === 'PENDING') {
        setInfoMessage('Loading market data…')
        socketRef.current?.subscribe(alert.symbolId, alert.timeframe)
        if (generation === loadGenerationRef.current) setSwitching(false)
        return
      }
      try {
        const candles = await loadCandles(alert.symbolId, alert.timeframe, generation)
        if (candles === null) return
        setInfoMessage(infoAfterCandleLoad(candles, marketPhaseRef.current))
        socketRef.current?.subscribe(alert.symbolId, alert.timeframe)
      } catch (err) {
        if (generation === loadGenerationRef.current)
          setError(err instanceof Error ? err.message : 'Failed to open alert on chart')
      } finally {
        if (generation === loadGenerationRef.current) setSwitching(false)
      }
    },
    [
      loading,
      adding,
      watchlistRef,
      setError,
      overlay,
      activeSymbolIdRef,
      timeframeRef,
      setActiveSymbolId,
      setTimeframe,
      candlesRef,
      loadedSeriesKeyRef,
      seriesRef,
      applySeriesData,
      chartTypeRef,
      socketRef,
      loadGenerationRef,
      setSwitching,
      setInfoMessage,
      ohlcHoveringRef,
      setOhlcLegend,
      clearSeriesDataFor,
      loadCandles,
      marketPhaseRef,
    ],
  )

  const handleAdd = useCallback(
    async (input) => {
      setAdding(true)
      setError(null)
      setInfoMessage('Adding & seeding…')
      const label =
        typeof input === 'string' ? input : input?.symbol || input?.instrumentKey || 'symbol'
      try {
        const entry = await addSymbol(input)
        const refreshed = await fetchWatchlist()
        setWatchlist(refreshed)
        watchlistRef.current = refreshed
        if (normalizeStatus(entry.bootstrapStatus) === 'FAILED') {
          setError(entry.bootstrapError || `Failed to add ${entry.tradingSymbol || label}`)
          setInfoMessage(null)
          return
        }
        setInfoMessage(null)
        await switchToSymbol(entry.symbolId, entry, { force: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add symbol')
        setInfoMessage(null)
      } finally {
        setAdding(false)
      }
    },
    [setAdding, setError, setInfoMessage, setWatchlist, watchlistRef, switchToSymbol],
  )

  const handleRemove = useCallback(
    async (symbolId) => {
      if (!symbolId || loading || adding) return
      setError(null)
      const wasActive = symbolId === activeSymbolIdRef.current
      try {
        await removeSymbol(symbolId)
        const refreshed = await fetchWatchlist()
        setWatchlist(refreshed)
        watchlistRef.current = refreshed
        if (!refreshed.length) {
          loadGenerationRef.current += 1
          setActiveSymbolId(null)
          activeSymbolIdRef.current = null
          candlesRef.current.clear()
          loadedSeriesKeyRef.current = null
          overlay.resetOverlayForEmptyWatchlist()
          if (seriesRef.current)
            applySeriesData(seriesRef.current, chartTypeRef.current, {
              restoreOverlay: false,
            })
          setError('Watchlist is empty. Add a symbol to begin.')
          return
        }
        if (wasActive) {
          const next =
            refreshed.find((e) => normalizeStatus(e.bootstrapStatus) === 'READY') ||
            refreshed[0]
          await switchToSymbol(next.symbolId, next, { force: true })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove symbol')
      }
    },
    [
      loading,
      adding,
      setError,
      activeSymbolIdRef,
      setWatchlist,
      watchlistRef,
      loadGenerationRef,
      setActiveSymbolId,
      candlesRef,
      loadedSeriesKeyRef,
      overlay,
      seriesRef,
      applySeriesData,
      chartTypeRef,
      switchToSymbol,
    ],
  )

  return {
    switchToSymbol,
    handleSymbolChange,
    handleTimeframeChange,
    handleAlertSelect,
    handleAdd,
    handleRemove,
  }
}

/**
 * Symbol / timeframe / alert / watchlist mutation handlers for the chart page.
 */
import { useCallback } from 'react'
import { addSymbol, fetchWatchlist, removeSymbol } from '../services/watchlistApi'
import { normalizeStatus } from '../chart/helpers'
import { handleNonReadyBootstrap, loadReadySeries } from '../chart/seriesLoad'

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

      if (
        handleNonReadyBootstrap({
          entry,
          symbolId: nextSymbolId,
          timeframe: timeframeRef.current,
          socketRef,
          setError,
          setInfoMessage,
        })
      ) {
        if (generation === loadGenerationRef.current) setSwitching(false)
        return
      }

      await loadReadySeries({
        symbolId: nextSymbolId,
        timeframe: timeframeRef.current,
        generation,
        loadGenerationRef,
        loadCandles,
        marketPhaseRef,
        socketRef,
        setInfoMessage,
        setError,
        setSwitching,
        errorFallback: 'Failed to load symbol',
      })
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

      if (
        handleNonReadyBootstrap({
          entry,
          symbolId: activeSymbolIdRef.current,
          timeframe: nextTf,
          socketRef,
          setError,
          setInfoMessage,
        })
      ) {
        ++loadGenerationRef.current
        return
      }

      const generation = ++loadGenerationRef.current
      setSwitching(true)
      setError(null)
      await loadReadySeries({
        symbolId: activeSymbolIdRef.current,
        timeframe: nextTf,
        generation,
        loadGenerationRef,
        loadCandles,
        marketPhaseRef,
        socketRef,
        setInfoMessage,
        setError,
        setSwitching,
        errorFallback: 'Failed to load timeframe',
        preferFailedBanner: true,
        watchlistRef,
      })
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

      // FAILED: switch context without loading candles (same as before).
      if (normalizeStatus(entry.bootstrapStatus) === 'FAILED') {
        handleNonReadyBootstrap({
          entry,
          symbolId: alert.symbolId,
          timeframe: alert.timeframe,
          socketRef,
          setError,
          setInfoMessage,
        })
        setActiveSymbolId(alert.symbolId)
        activeSymbolIdRef.current = alert.symbolId
        setTimeframe(alert.timeframe)
        timeframeRef.current = alert.timeframe
        candlesRef.current.clear()
        loadedSeriesKeyRef.current = null
        overlay.wipeOverlay()
        if (seriesRef.current)
          applySeriesData(seriesRef.current, chartTypeRef.current, { restoreOverlay: false })
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

      if (
        handleNonReadyBootstrap({
          entry,
          symbolId: alert.symbolId,
          timeframe: alert.timeframe,
          socketRef,
          setError,
          setInfoMessage,
        })
      ) {
        if (generation === loadGenerationRef.current) setSwitching(false)
        return
      }

      await loadReadySeries({
        symbolId: alert.symbolId,
        timeframe: alert.timeframe,
        generation,
        loadGenerationRef,
        loadCandles,
        marketPhaseRef,
        socketRef,
        setInfoMessage,
        setError,
        setSwitching,
        errorFallback: 'Failed to open alert on chart',
      })
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  DEFAULT_TIMEFRAME,
  DEFAULT_TIMEFRAMES,
  fetchCandles,
} from '../services/marketApi'
import {
  buildSymbolLabels,
  normalizeStatus,
  resolveDisplayStatus,
} from '../chart/helpers'
import { usePatternOverlay } from '../chart/usePatternOverlay'
import { useChartEngine } from '../hooks/useChartEngine'
import { useChartBootstrap } from '../hooks/useChartBootstrap'
import { useChartNavigation } from '../hooks/useChartNavigation'
import { useLiveMessageHandler } from '../hooks/useLiveMessageHandler'
import { usePendingBootstrapPoll } from '../hooks/usePendingBootstrapPoll'
import { seriesKey } from '../utils/patternOverlay'
import AlertsFeed from './AlertsFeed'
import ChartHeader from './ChartHeader'
import ChartPanel from './ChartPanel'
import SymbolSwitcher from './SymbolSwitcher'

/**
 * Chart page composer — wires auth, engine, overlay, bootstrap, navigation, chrome.
 */
export default function ChartContainer() {
  const { user, isAdmin, logout } = useAuth()

  const chartTypeRef = useRef('candlestick')
  const marketPhaseRef = useRef('unknown')
  const wsStatusRef = useRef('connecting')
  const socketRef = useRef(null)
  const timeframeRef = useRef(DEFAULT_TIMEFRAME)
  const activeSymbolIdRef = useRef(null)
  const loadGenerationRef = useRef(0)
  const watchlistRef = useRef([])
  const disposedRef = useRef(false)

  const [watchlist, setWatchlist] = useState([])
  const [activeSymbolId, setActiveSymbolId] = useState(null)
  const [timeframes, setTimeframes] = useState([...DEFAULT_TIMEFRAMES])
  const [timeframe, setTimeframe] = useState(DEFAULT_TIMEFRAME)
  const [chartType, setChartType] = useState('candlestick')
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState(null)
  const [infoMessage, setInfoMessage] = useState(null)

  chartTypeRef.current = chartType
  timeframeRef.current = timeframe
  activeSymbolIdRef.current = activeSymbolId
  watchlistRef.current = watchlist

  /** Indirection so engine + socket always call the latest overlay API. */
  const overlayApiRef = useRef({
    wipeOverlay() {},
    willRestoreForCurrentSeries: () => false,
    restoreOverlayAfterData() {},
    captureKeepAlertForChartTypeSwitch: () => null,
    setPendingAlert() {},
    pushPatternAlert() {},
  })

  const engine = useChartEngine({
    chartTypeRef,
    overlay: {
      wipeOverlay: (...a) => overlayApiRef.current.wipeOverlay(...a),
      willRestoreForCurrentSeries: (...a) =>
        overlayApiRef.current.willRestoreForCurrentSeries(...a),
      restoreOverlayAfterData: (...a) =>
        overlayApiRef.current.restoreOverlayAfterData(...a),
      captureKeepAlertForChartTypeSwitch: (...a) =>
        overlayApiRef.current.captureKeepAlertForChartTypeSwitch(...a),
      setPendingAlert: (...a) => overlayApiRef.current.setPendingAlert(...a),
    },
  })

  const overlay = usePatternOverlay({
    chartRef: engine.chartRef,
    seriesRef: engine.seriesRef,
    candlesRef: engine.candlesRef,
    activeSymbolIdRef,
    timeframeRef,
    loadedSeriesKeyRef: engine.loadedSeriesKeyRef,
    disposedRef,
    loading,
    activeSymbolId,
    timeframe,
  })
  overlayApiRef.current = overlay

  const {
    containerRef,
    chartRef,
    seriesRef,
    candlesRef,
    ohlcHoveringRef,
    loadedSeriesKeyRef,
    ohlcLegend,
    setOhlcLegend,
    applySeriesData,
    switchChartType,
    upsertCandle,
    updateVolumeLive,
    syncOhlcLegendFromLatest,
    clearSeriesDataFor,
    mountSeries,
    clearEngineRefs,
  } = engine

  const updateConnectionStatus = useCallback((wsStatus, marketPhase) => {
    wsStatusRef.current = wsStatus
    if (marketPhase) marketPhaseRef.current = marketPhase
    setConnectionStatus(resolveDisplayStatus(wsStatus, marketPhaseRef.current))
  }, [])

  const loadCandles = useCallback(
    async (symbolId, tf, generation) => {
      const candles = await fetchCandles({ symbolId, timeframe: tf })
      if (generation !== loadGenerationRef.current) return null
      candlesRef.current.clear()
      candles.forEach((c) => candlesRef.current.set(c.time, c))
      loadedSeriesKeyRef.current = seriesKey(symbolId, tf)
      if (seriesRef.current) applySeriesData(seriesRef.current, chartTypeRef.current)
      return candles
    },
    [applySeriesData, candlesRef, loadedSeriesKeyRef, seriesRef],
  )

  const onLiveMessage = useLiveMessageHandler({
    isStale: () => disposedRef.current,
    chartTypeRef,
    timeframeRef,
    activeSymbolIdRef,
    seriesRef,
    wsStatusRef,
    overlayApiRef,
    upsertCandle,
    updateVolumeLive,
    syncOhlcLegendFromLatest,
    applySeriesData,
    updateConnectionStatus,
    setInfoMessage,
  })

  const onLiveStatus = useCallback(
    (wsStatus, message) => {
      if (disposedRef.current) return
      if (wsStatus === 'error' && message) {
        if (
          typeof message === 'string' &&
          message.toLowerCase().includes('symbol removed from watchlist')
        ) {
          return
        }
        const active = watchlistRef.current.find(
          (e) => e.symbolId === activeSymbolIdRef.current,
        )
        if (normalizeStatus(active?.bootstrapStatus) !== 'FAILED') setError(message)
      }
      updateConnectionStatus(wsStatus, marketPhaseRef.current)
    },
    [updateConnectionStatus],
  )

  useChartBootstrap({
    disposedRef,
    loadGenerationRef,
    marketPhaseRef,
    timeframeRef,
    activeSymbolIdRef,
    watchlistRef,
    chartTypeRef,
    socketRef,
    containerRef,
    chartRef,
    candlesRef,
    ohlcHoveringRef,
    loadedSeriesKeyRef,
    setTimeframes,
    setTimeframe,
    setWatchlist,
    setActiveSymbolId,
    setError,
    setInfoMessage,
    setLoading,
    setOhlcLegend,
    updateConnectionStatus,
    loadCandles,
    mountSeries,
    clearEngineRefs,
    onLiveMessage,
    onLiveStatus,
  })

  const needsPendingPoll =
    !loading && watchlist.some((e) => normalizeStatus(e.bootstrapStatus) === 'PENDING')

  usePendingBootstrapPoll({
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
  })

  const chartTypeEffectReadyRef = useRef(false)
  useEffect(() => {
    if (!chartRef.current || loading) {
      if (!loading) chartTypeEffectReadyRef.current = true
      return
    }
    if (!chartTypeEffectReadyRef.current) {
      chartTypeEffectReadyRef.current = true
      return
    }
    switchChartType(chartType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, loading])

  const {
    handleSymbolChange,
    handleTimeframeChange,
    handleAlertSelect,
    handleAdd,
    handleRemove,
  } = useChartNavigation({
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
  })

  const activeEntry = watchlist.find((e) => e.symbolId === activeSymbolId) ?? null
  const displayName =
    activeEntry?.tradingSymbol || activeEntry?.displayName || activeSymbolId || '…'
  const activeIsFailed = normalizeStatus(activeEntry?.bootstrapStatus) === 'FAILED'
  const activeIsPending = normalizeStatus(activeEntry?.bootstrapStatus) === 'PENDING'
  const symbolLabels = useMemo(() => buildSymbolLabels(watchlist), [watchlist])
  const controlsDisabled =
    loading || adding || !activeSymbolId || activeIsFailed || activeIsPending

  return (
    <div className="chart-page">
      <ChartHeader
        displayName={activeSymbolId ? displayName : 'Loading…'}
        connectionStatus={connectionStatus}
        timeframes={timeframes}
        timeframe={timeframe}
        onTimeframeChange={handleTimeframeChange}
        chartType={chartType}
        onChartTypeChange={setChartType}
        controlsDisabled={controlsDisabled}
        user={user}
        isAdmin={isAdmin}
        onLogout={() => logout()}
      />

      {error && <div className="chart-error">{error}</div>}
      {!error && infoMessage && <div className="chart-info">{infoMessage}</div>}

      <div className="chart-body">
        <ChartPanel
          containerRef={containerRef}
          loading={loading}
          switching={switching}
          adding={adding}
          activeIsPending={activeIsPending}
          ohlcLegend={ohlcLegend}
        />

        <div className="right-rail">
          <AlertsFeed
            alerts={overlay.alerts}
            selectedId={overlay.selectedAlertId}
            selectedInstanceId={overlay.selectedInstanceId}
            onSelect={handleAlertSelect}
            onClear={overlay.clearAllAlerts}
            symbolLabels={symbolLabels}
          />
          <SymbolSwitcher
            watchlist={watchlist}
            activeSymbolId={activeSymbolId}
            onSelect={handleSymbolChange}
            onAdd={handleAdd}
            onRemove={handleRemove}
            disabled={loading}
            adding={adding}
            canManage={isAdmin}
          />
        </div>
      </div>
    </div>
  )
}

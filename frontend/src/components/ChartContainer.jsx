import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { isChartPaperTradeEnabled } from '../config/featureFlags'
import {
  DEFAULT_TIMEFRAME,
  DEFAULT_TIMEFRAMES,
  fetchCandles,
} from '../services/marketApi'
import { parsePaperApiError } from '../services/paperApi'
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
import { paperTradeDisabledReason } from '../utils/paperTradable'
import { seriesKey } from '../utils/patternOverlay'
import AlertsFeed from './AlertsFeed'
import ChartHeader from './ChartHeader'
import ChartPanel from './ChartPanel'
import ChartTradeButtons from './ChartTradeButtons'
import PaperOrderModal from './PaperOrderModal'
import PaperToastHost from './PaperToast'
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
  /** Mobile dock: chart | alerts | watchlist (CSS shows dock ≤768px) */
  const [mobilePanel, setMobilePanel] = useState('chart')

  /** Chart paper trade chrome (flag-gated; ChartHeader always mounts). */
  const chartPaperTradeOn = isChartPaperTradeEnabled()
  /** @type {[null | { side: 'BUY'|'SELL', instrumentKey: string, tradingSymbol: string }, Function]} */
  const [orderModal, setOrderModal] = useState(null)
  const [placeInFlight, setPlaceInFlight] = useState(false)
  const [closeAfterPlace, setCloseAfterPlace] = useState(false)
  const [toasts, setToasts] = useState([])
  /** Which header button opened the modal — for focus restore. */
  const openerRef = useRef(null)
  const placeInFlightRef = useRef(false)
  const closeAfterPlaceRef = useRef(false)
  placeInFlightRef.current = placeInFlight
  closeAfterPlaceRef.current = closeAfterPlace

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

  const disabledReason = paperTradeDisabledReason(activeEntry, user)
  const tradeEnabled = chartPaperTradeOn && disabledReason === ''

  const pushToast = useCallback((toast) => {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    setToasts((prev) => [...prev, { id, ...toast }])
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Symbol-switch auto-close (merge-blocking): defer while place in-flight
  useEffect(() => {
    if (!orderModal) return
    if (!activeSymbolId || activeSymbolId === orderModal.instrumentKey) return
    if (placeInFlight) {
      setCloseAfterPlace(true)
      return
    }
    setOrderModal(null)
    pushToast({ kind: 'info', message: 'Symbol changed — ticket closed' })
  }, [activeSymbolId, orderModal, placeInFlight, pushToast])

  // Restore focus to Buy/Sell opener when modal closes
  useEffect(() => {
    if (orderModal) return
    const which = openerRef.current
    if (!which) return
    openerRef.current = null
    const elId = which === 'sell' ? 'chart-trade-sell' : 'chart-trade-buy'
    requestAnimationFrame(() => {
      document.getElementById(elId)?.focus()
    })
  }, [orderModal])

  // After mobile dock shows chart again, force Lightweight Charts to measure the pane
  useEffect(() => {
    if (mobilePanel !== 'chart') return
    const chart = chartRef.current
    const el = containerRef.current
    if (!chart || !el) return
    const id = requestAnimationFrame(() => {
      try {
        const w = el.clientWidth
        const h = el.clientHeight
        if (w > 0 && h > 0) chart.resize(w, h)
      } catch {
        /* chart disposed */
      }
    })
    return () => cancelAnimationFrame(id)
  }, [mobilePanel, chartRef, containerRef])

  const openOrderModal = useCallback(
    (side) => {
      if (!activeSymbolId || !tradeEnabled) return
      openerRef.current = side === 'SELL' ? 'sell' : 'buy'
      setCloseAfterPlace(false)
      setOrderModal({
        side,
        instrumentKey: activeSymbolId,
        tradingSymbol: displayName,
      })
    },
    [activeSymbolId, tradeEnabled, displayName],
  )

  return (
    <div className={`chart-page chart-page--mobile-${mobilePanel}`}>
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
        tradeSlot={
          chartPaperTradeOn ? (
            <ChartTradeButtons
              disabled={!tradeEnabled}
              disabledReason={disabledReason}
              tradingSymbol={displayName}
              onBuy={() => openOrderModal('BUY')}
              onSell={() => openOrderModal('SELL')}
            />
          ) : null
        }
      />

      {error && <div className="chart-error">{error}</div>}
      {!error && infoMessage && <div className="chart-info">{infoMessage}</div>}

      <div className="chart-body">
        <div className="chart-main" data-mobile-panel="chart">
          <ChartPanel
            containerRef={containerRef}
            loading={loading}
            switching={switching}
            adding={adding}
            activeIsPending={activeIsPending}
            ohlcLegend={ohlcLegend}
            onClearDrawings={overlay.clearChartDrawings}
            clearDrawingsEnabled={overlay.hasChartDrawings}
          />
        </div>

        <div className="right-rail">
          <div className="right-rail__alerts" data-mobile-panel="alerts">
            <AlertsFeed
              alerts={overlay.alerts}
              selectedId={overlay.selectedAlertId}
              selectedInstanceId={overlay.selectedInstanceId}
              onSelect={(a) => {
                setMobilePanel('chart')
                handleAlertSelect(a)
              }}
              onClear={overlay.clearAllAlerts}
              symbolLabels={symbolLabels}
            />
          </div>
          <div className="right-rail__watchlist" data-mobile-panel="watchlist">
            <SymbolSwitcher
              watchlist={watchlist}
              activeSymbolId={activeSymbolId}
              onSelect={(id) => {
                setMobilePanel('chart')
                handleSymbolChange(id)
              }}
              onAdd={handleAdd}
              onRemove={handleRemove}
              disabled={loading}
              adding={adding}
              canManage={isAdmin}
            />
          </div>
        </div>
      </div>

      <nav className="mobile-dock" aria-label="Main panels">
        <button
          type="button"
          className={`mobile-dock__btn${mobilePanel === 'chart' ? ' is-active' : ''}`}
          onClick={() => setMobilePanel('chart')}
        >
          Chart
        </button>
        <button
          type="button"
          className={`mobile-dock__btn${mobilePanel === 'alerts' ? ' is-active' : ''}`}
          onClick={() => setMobilePanel('alerts')}
        >
          Alerts
          {overlay.alerts?.length > 0 ? (
            <span className="mobile-dock__badge">{overlay.alerts.length}</span>
          ) : null}
        </button>
        <button
          type="button"
          className={`mobile-dock__btn${mobilePanel === 'watchlist' ? ' is-active' : ''}`}
          onClick={() => setMobilePanel('watchlist')}
        >
          Symbols
        </button>
      </nav>

      {chartPaperTradeOn && orderModal ? (
        <PaperOrderModal
          side={orderModal.side}
          instrumentKey={orderModal.instrumentKey}
          tradingSymbol={orderModal.tradingSymbol}
          activeSymbolId={activeSymbolId}
          onSubmittingChange={setPlaceInFlight}
          onClose={() => {
            if (placeInFlightRef.current) return
            setOrderModal(null)
          }}
          onPlaced={(order) => {
            pushToast({
              kind: 'success',
              message: `Order accepted · ${order.side} ${order.orderType} ${order.tradingSymbol} ×${order.qty}`,
            })
            setPlaceInFlight(false)
            setCloseAfterPlace(false)
            setOrderModal(null)
          }}
          onPlaceError={(err) => {
            const { code, message } = parsePaperApiError(err)
            pushToast({
              kind: 'error',
              message: code ? `${code} — ${message}` : message,
            })
            setPlaceInFlight(false)
            if (closeAfterPlaceRef.current) {
              setCloseAfterPlace(false)
              setOrderModal(null)
            }
          }}
        />
      ) : null}

      {chartPaperTradeOn ? (
        <PaperToastHost toasts={toasts} onDismiss={dismissToast} />
      ) : null}
    </div>
  )
}

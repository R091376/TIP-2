import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { parsePanel, stripPanelFromSearch } from '../utils/panelDeepLink'
import { seriesKey } from '../utils/patternOverlay'
import AlertsFeed from './AlertsFeed'
import ChartHeader from './ChartHeader'
import ChartPanel from './ChartPanel'
import ChartOpenOrdersStrip from './ChartOpenOrdersStrip'
import ChartTradeButtons from './ChartTradeButtons'
import PaperOrderModal from './PaperOrderModal'
import SymbolSwitcher from './SymbolSwitcher'
import { useToasts } from '../hooks/useToasts'

/**
 * Chart page composer — wires auth, engine, overlay, bootstrap, navigation, chrome.
 */
export default function ChartContainer() {
  const { user, isAdmin } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

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
  /**
   * Once the user dismisses the blue info banner, keep it hidden until full page reload.
   * Do not reset on symbol switch / alerts / market-phase re-sets of the same banner.
   */
  const [infoBannerDismissedForSession, setInfoBannerDismissedForSession] = useState(false)
  /** Mobile dock: chart | alerts | watchlist (CSS shows dock ≤768px) */
  const [mobilePanel, setMobilePanel] = useState('chart')

  /** Chart paper trade chrome (flag-gated; ChartHeader always mounts). */
  const chartPaperTradeOn = isChartPaperTradeEnabled()
  /** @type {[null | { side: 'BUY'|'SELL', instrumentKey: string, tradingSymbol: string }, Function]} */
  const [orderModal, setOrderModal] = useState(null)
  const [placeInFlight, setPlaceInFlight] = useState(false)
  const [closeAfterPlace, setCloseAfterPlace] = useState(false)
  const { pushToast } = useToasts()
  /** Bump to force ChartOpenOrdersStrip refetch after place / cancel. */
  const [stripRefreshNonce, setStripRefreshNonce] = useState(0)
  /** Last accepted place — strip merges optimistically by id. */
  const [lastPlacedOrder, setLastPlacedOrder] = useState(null)
  /** Which Buy/Sell control opened the modal — for focus restore. */
  const openerRef = useRef(null)
  const placeInFlightRef = useRef(false)
  const closeAfterPlaceRef = useRef(false)
  // Keep refs in sync with state for render paths; async handlers also write refs
  // synchronously via setPlaceInFlightSync / setCloseAfterPlaceSync.
  placeInFlightRef.current = placeInFlight
  closeAfterPlaceRef.current = closeAfterPlace

  /** Sync ref + state so async place settle never reads a one-frame-stale flag. */
  const setPlaceInFlightSync = useCallback((v) => {
    placeInFlightRef.current = !!v
    setPlaceInFlight(!!v)
  }, [])

  const setCloseAfterPlaceSync = useCallback((v) => {
    closeAfterPlaceRef.current = !!v
    setCloseAfterPlace(!!v)
  }, [])

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

  // Symbol-switch auto-close (merge-blocking): defer while place in-flight.
  // Null/empty activeSymbolId is divergence (e.g. last symbol removed).
  useEffect(() => {
    if (!orderModal) return
    // Still on snapshot symbol — clear sticky close defer if user switched back
    if (activeSymbolId && activeSymbolId === orderModal.instrumentKey) {
      setCloseAfterPlaceSync(false)
      return
    }
    // Diverged: null, empty, or different key
    if (placeInFlight) {
      setCloseAfterPlaceSync(true)
      return
    }
    setOrderModal(null)
    pushToast({ kind: 'info', message: 'Symbol changed — ticket closed' })
  }, [activeSymbolId, orderModal, placeInFlight, pushToast, setCloseAfterPlaceSync])

  // Restore focus to Buy/Sell opener when modal closes; fall back if disabled
  useEffect(() => {
    if (orderModal) return
    const which = openerRef.current
    if (!which) return
    openerRef.current = null
    const elId = which === 'sell' ? 'chart-trade-sell' : 'chart-trade-buy'
    requestAnimationFrame(() => {
      try {
        const opener = document.getElementById(elId)
        if (opener && !opener.disabled) {
          opener.focus()
          return
        }
        // Opener missing or disabled (e.g. switched to index/empty) — stable fallback
        const fallback =
          document.querySelector('.chart-top-toolbar .chart-trade-buttons') ||
          document.querySelector('.chart-header__controls button:not(:disabled)')
        if (fallback && typeof fallback.focus === 'function') {
          fallback.focus()
        }
      } catch {
        /* focus not available */
      }
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
      setCloseAfterPlaceSync(false)
      setOrderModal({
        side,
        instrumentKey: activeSymbolId,
        tradingSymbol: displayName,
      })
    },
    [activeSymbolId, tradeEnabled, displayName, setCloseAfterPlaceSync],
  )

  // Keyboard: B = buy, S = sell (ignore when typing / modal open)
  useEffect(() => {
    if (!chartPaperTradeOn) return undefined
    function onKey(e) {
      if (orderModal || placeInFlight) return
      const t = e.target
      if (
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key?.toLowerCase()
      if (k === 'b') {
        e.preventDefault()
        if (tradeEnabled) openOrderModal('BUY')
        else if (disabledReason) pushToast({ kind: 'info', message: disabledReason })
      } else if (k === 's') {
        e.preventDefault()
        if (tradeEnabled) openOrderModal('SELL')
        else if (disabledReason) pushToast({ kind: 'info', message: disabledReason })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    chartPaperTradeOn,
    orderModal,
    placeInFlight,
    tradeEnabled,
    disabledReason,
    openOrderModal,
    pushToast,
  ])

  // Panel deep-link: presence-only apply, then replace-strip panel (no-op when absent).
  useEffect(() => {
    const panel = parsePanel(location.search)
    if (!panel) return

    const isMobile =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches

    if (isMobile) {
      setMobilePanel(panel)
    } else {
      const el = document.querySelector(`[data-mobile-panel="${panel}"]`)
      if (el instanceof HTMLElement) {
        el.classList.add('is-panel-flash')
        el.scrollIntoView({ block: 'nearest' })
        try {
          el.focus({ preventScroll: true })
        } catch {
          /* ignore */
        }
        window.setTimeout(() => el.classList.remove('is-panel-flash'), 1200)
      }
    }

    const nextSearch = stripPanelFromSearch(location.search)
    navigate({ pathname: location.pathname, search: nextSearch }, { replace: true })
  }, [location.search, location.pathname, navigate])

  return (
    <div className={`chart-page chart-page--in-shell chart-page--mobile-${mobilePanel}`}>
      <ChartHeader
        displayName={activeSymbolId ? displayName : 'Loading…'}
        connectionStatus={connectionStatus}
        timeframes={timeframes}
        timeframe={timeframe}
        onTimeframeChange={handleTimeframeChange}
        chartType={chartType}
        onChartTypeChange={setChartType}
        controlsDisabled={controlsDisabled}
        mobilePanel={mobilePanel}
        onMobilePanelChange={setMobilePanel}
        alertsCount={overlay.alerts?.length || 0}
      />

      {error && <div className="chart-error">{error}</div>}
      {!error && infoMessage && !infoBannerDismissedForSession ? (
        <div className="chart-info" role="status">
          <span className="chart-info__text">{infoMessage}</span>
          <button
            type="button"
            className="chart-info__dismiss"
            aria-label="Dismiss message"
            title="Dismiss"
            onClick={() => setInfoBannerDismissedForSession(true)}
          >
            ×
          </button>
        </div>
      ) : null}

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
            tradeSlot={
              chartPaperTradeOn ? (
                <ChartTradeButtons
                  compact
                  disabled={!tradeEnabled}
                  disabledReason={disabledReason}
                  tradingSymbol={displayName}
                  onBuy={() => openOrderModal('BUY')}
                  onSell={() => openOrderModal('SELL')}
                />
              ) : null
            }
          />
          {chartPaperTradeOn ? (
            <ChartOpenOrdersStrip
              instrumentKey={activeSymbolId}
              tradingSymbol={displayName}
              refreshNonce={stripRefreshNonce}
              optimisticOrder={lastPlacedOrder}
              onCancelDone={(id) => {
                setLastPlacedOrder((o) => (o?.id === id ? null : o))
                setStripRefreshNonce((n) => n + 1)
              }}
              onOptimisticClear={(id) => {
                setLastPlacedOrder((o) => (o?.id === id ? null : o))
              }}
              onToast={pushToast}
            />
          ) : null}
        </div>

        <div className="right-rail">
          <div
            className="right-rail__alerts"
            data-mobile-panel="alerts"
            tabIndex={-1}
          >
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
          <div
            className="right-rail__watchlist"
            data-mobile-panel="watchlist"
            tabIndex={-1}
          >
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

      {chartPaperTradeOn && orderModal ? (
        <PaperOrderModal
          side={orderModal.side}
          instrumentKey={orderModal.instrumentKey}
          tradingSymbol={orderModal.tradingSymbol}
          onSubmittingChange={setPlaceInFlightSync}
          onClose={() => {
            if (placeInFlightRef.current) return
            setOrderModal(null)
          }}
          onPlaced={(order) => {
            const st = (order.status || '').toUpperCase()
            const filled = Number(order.filledQty) || 0
            const msg =
              st === 'FILLED' || filled > 0
                ? `Filled · ${order.side} ${order.tradingSymbol} ×${filled || order.qty}${
                    order.price != null ? ` @ ₹${order.price}` : ''
                  }`
                : `Order accepted · ${order.side} ${order.orderType} ${order.tradingSymbol} ×${order.qty} (${st || 'OPEN'})`
            pushToast({ kind: 'success', message: msg })
            setLastPlacedOrder(order)
            setStripRefreshNonce((n) => n + 1)
            setPlaceInFlightSync(false)
            setCloseAfterPlaceSync(false)
            setOrderModal(null)
          }}
          onPlaceError={(err) => {
            const { code, message } = parsePaperApiError(err)
            const text = code ? `${code} — ${message}` : message || 'Order failed'
            pushToast({
              kind: 'error',
              message: text,
            })
            setPlaceInFlightSync(false)
            // Authoritative settle: close iff snapshot no longer matches live chart
            // (not solely closeAfterPlace — that flag can lag one frame behind switch)
            const live = activeSymbolIdRef.current
            const diverged = !live || live !== orderModal.instrumentKey
            if (diverged) {
              setCloseAfterPlaceSync(false)
              setOrderModal(null)
            } else {
              setCloseAfterPlaceSync(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}

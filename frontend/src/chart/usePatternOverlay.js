import { useEffect, useRef, useState } from 'react'
import {
  ALERTS_MAX,
  appendAlert,
  collectPinnedInstanceIds,
} from '../utils/alertList'
import {
  applyInstanceOverlay,
  clearPatternOverlay,
  collectInstanceEvents,
  seriesKey,
  willRestoreOverlay,
} from '../utils/patternOverlay'
import {
  seriesChartTimesFromCandles,
  sortedCandlesFromMap,
} from './helpers'

function instanceSignature(instanceId, alertList) {
  if (!instanceId) return ''
  return collectInstanceEvents(alertList, instanceId)
    .map((e) => e.id)
    .join('|')
}

/**
 * Pattern alerts + chart overlay lifecycle (memory, paint, restore).
 *
 * Chart host owns series/candles; this hook only draws on top when data is ready.
 *
 * @param {{
 *   chartRef: React.MutableRefObject,
 *   seriesRef: React.MutableRefObject,
 *   candlesRef: React.MutableRefObject<Map>,
 *   activeSymbolIdRef: React.MutableRefObject,
 *   timeframeRef: React.MutableRefObject,
 *   loadedSeriesKeyRef: React.MutableRefObject,
 *   disposedRef: React.MutableRefObject<boolean>,
 *   loading: boolean,
 *   activeSymbolId: string | null,
 *   timeframe: string,
 * }} deps
 */
export function usePatternOverlay({
  chartRef,
  seriesRef,
  candlesRef,
  activeSymbolIdRef,
  timeframeRef,
  loadedSeriesKeyRef,
  disposedRef,
  loading,
  activeSymbolId,
  timeframe,
}) {
  const overlayHandleRef = useRef(null)
  const pendingOverlayAlertRef = useRef(null)
  const alertsRef = useRef([])
  const selectedAlertIdRef = useRef(null)
  const focusedInstanceIdRef = useRef(null)
  const overlayMemoryRef = useRef(new Map())
  const lastPaintedInstanceSigRef = useRef('')

  const [alerts, setAlerts] = useState([])
  const [selectedAlertId, setSelectedAlertId] = useState(null)
  const [selectedInstanceId, setSelectedInstanceId] = useState(null)

  alertsRef.current = alerts
  selectedAlertIdRef.current = selectedAlertId
  focusedInstanceIdRef.current = selectedInstanceId

  function wipeOverlay() {
    clearPatternOverlay(overlayHandleRef.current)
    overlayHandleRef.current = null
  }

  function memoryKey(symbolId = activeSymbolIdRef.current, tf = timeframeRef.current) {
    return seriesKey(symbolId, tf)
  }

  function pinnedInstanceIds() {
    return collectPinnedInstanceIds(
      focusedInstanceIdRef.current,
      overlayMemoryRef.current,
    )
  }

  function rememberOverlay(symbolId, tf, instanceId, focusAlertId) {
    const key = memoryKey(symbolId, tf)
    if (!key || !instanceId) return
    overlayMemoryRef.current.set(key, {
      instanceId,
      focusAlertId: focusAlertId || null,
    })
  }

  function resolveMemoryFocus(symbolId, tf) {
    const key = memoryKey(symbolId, tf)
    if (!key) return null
    const mem = overlayMemoryRef.current.get(key)
    if (!mem?.instanceId) return null
    const events = collectInstanceEvents(alertsRef.current, mem.instanceId)
    if (!events.length) {
      overlayMemoryRef.current.delete(key)
      return null
    }
    return (
      (mem.focusAlertId && events.find((e) => e.id === mem.focusAlertId)) ||
      events[events.length - 1]
    )
  }

  function setFocusSelection(focusAlert) {
    if (!focusAlert) {
      selectedAlertIdRef.current = null
      focusedInstanceIdRef.current = null
      setSelectedAlertId(null)
      setSelectedInstanceId(null)
      return
    }
    selectedAlertIdRef.current = focusAlert.id
    focusedInstanceIdRef.current = focusAlert.instanceId || null
    setSelectedAlertId(focusAlert.id)
    setSelectedInstanceId(focusAlert.instanceId || null)
  }

  function paintOverlayIfReady(focusAlert, opts = {}) {
    if (!focusAlert || !seriesRef.current || !chartRef.current) return false
    if (focusAlert.symbolId !== activeSymbolIdRef.current) return false
    if (focusAlert.timeframe !== timeframeRef.current) return false
    const wantKey = seriesKey(focusAlert.symbolId, focusAlert.timeframe)
    if (!wantKey || loadedSeriesKeyRef.current !== wantKey) return false

    const events = collectInstanceEvents(alertsRef.current, focusAlert.instanceId)
    const drawEvents = events.length ? events : [focusAlert]
    const focusView = opts.focusView !== false
    const candles = sortedCandlesFromMap(candlesRef.current)
    // Never paint on empty series — clears pending and flashes wrong viewport/markers.
    if (!candles.length) return false

    wipeOverlay()
    overlayHandleRef.current = applyInstanceOverlay(seriesRef.current, chartRef.current, {
      events: drawEvents,
      focusAlert,
      instanceId: focusAlert.instanceId,
      patternType: focusAlert.patternType,
      direction: focusAlert.direction,
      referenceLevel: focusAlert.referenceLevel,
      seriesChartTimes: seriesChartTimesFromCandles(candles),
      focusView,
    })

    if (overlayHandleRef.current) {
      setFocusSelection(focusAlert)
      rememberOverlay(
        focusAlert.symbolId,
        focusAlert.timeframe,
        focusAlert.instanceId,
        focusAlert.id,
      )
      lastPaintedInstanceSigRef.current = instanceSignature(
        focusAlert.instanceId,
        alertsRef.current,
      )
      return true
    }
    return false
  }

  function restoreOverlayAfterData(opts = {}) {
    const focusView = opts.focusView !== false
    const pending = pendingOverlayAlertRef.current
    if (
      pending &&
      pending.symbolId === activeSymbolIdRef.current &&
      pending.timeframe === timeframeRef.current
    ) {
      // Only clear pending after a successful paint; keep for next series apply
      if (paintOverlayIfReady(pending, { focusView })) {
        pendingOverlayAlertRef.current = null
      }
      return
    }

    const focus = resolveMemoryFocus(
      activeSymbolIdRef.current,
      timeframeRef.current,
    )
    if (focus) {
      paintOverlayIfReady(focus, { focusView })
    }
  }

  function willRestoreForCurrentSeries() {
    return willRestoreOverlay(
      pendingOverlayAlertRef.current,
      resolveMemoryFocus(activeSymbolIdRef.current, timeframeRef.current),
      activeSymbolIdRef.current,
      timeframeRef.current,
    )
  }

  function pushPatternAlert(message) {
    if (!message?.symbolId || !message?.timeframe || message.time == null) return
    if (message.price == null || Number.isNaN(Number(message.price))) return

    const id = [
      message.instanceId || 'x',
      message.stage || 'event',
      message.time ?? '',
      message.price ?? '',
    ].join(':')

    const alert = {
      id,
      symbolId: message.symbolId,
      timeframe: message.timeframe,
      patternType: message.patternType,
      stage: message.stage,
      price: message.price,
      time: message.time,
      referenceLevel: message.referenceLevel,
      instanceId: message.instanceId,
      direction: message.direction,
      status: message.status,
      receivedAt: Date.now(),
    }

    setAlerts((prev) => {
      const next = appendAlert(prev, alert, {
        max: ALERTS_MAX,
        pinnedInstanceIds: pinnedInstanceIds(),
      })
      alertsRef.current = next
      return next
    })
  }

  /**
   * Before leaving a series: remember current focus.
   * After deciding next series: set pending restore from memory.
   */
  function beginSeriesNavigation(nextSymbolId, nextTimeframe) {
    rememberOverlay(
      activeSymbolIdRef.current,
      timeframeRef.current,
      focusedInstanceIdRef.current,
      selectedAlertIdRef.current,
    )
    pendingOverlayAlertRef.current = null
    wipeOverlay()
    lastPaintedInstanceSigRef.current = ''
    setFocusSelection(null)

    const restore = resolveMemoryFocus(nextSymbolId, nextTimeframe)
    if (restore) {
      pendingOverlayAlertRef.current = restore
      setFocusSelection(restore)
    }
    return restore
  }

  function captureKeepAlertForChartTypeSwitch() {
    const list = alertsRef.current
    return (
      pendingOverlayAlertRef.current ||
      (selectedAlertIdRef.current
        ? list.find((a) => a.id === selectedAlertIdRef.current)
        : null) ||
      (focusedInstanceIdRef.current
        ? collectInstanceEvents(list, focusedInstanceIdRef.current).slice(-1)[0]
        : null) ||
      resolveMemoryFocus(activeSymbolIdRef.current, timeframeRef.current)
    )
  }

  function setPendingAlert(alert) {
    pendingOverlayAlertRef.current = alert
  }

  function clearPendingAlert() {
    pendingOverlayAlertRef.current = null
  }

  function clearAllAlerts() {
    setAlerts([])
    alertsRef.current = []
    setFocusSelection(null)
    selectedAlertIdRef.current = null
    focusedInstanceIdRef.current = null
    pendingOverlayAlertRef.current = null
    lastPaintedInstanceSigRef.current = ''
    overlayMemoryRef.current.clear()
    wipeOverlay()
  }

  function resetOverlayForEmptyWatchlist() {
    pendingOverlayAlertRef.current = null
    lastPaintedInstanceSigRef.current = ''
    setFocusSelection(null)
    wipeOverlay()
  }

  // Live refresh when focused instance gains stages
  useEffect(() => {
    if (loading || disposedRef.current) return
    const instanceId = focusedInstanceIdRef.current
    if (!instanceId) return
    const events = collectInstanceEvents(alerts, instanceId)
    if (!events.length) return
    const focus =
      events.find((e) => e.id === selectedAlertIdRef.current) ||
      events[events.length - 1]
    if (
      focus.symbolId !== activeSymbolIdRef.current ||
      focus.timeframe !== timeframeRef.current
    ) {
      return
    }
    const sig = instanceSignature(instanceId, alerts)
    if (sig === lastPaintedInstanceSigRef.current) return
    if (!seriesRef.current || !chartRef.current) return
    paintOverlayIfReady(focus, { focusView: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paint uses refs; alerts/selection drive refresh
  }, [alerts, loading, selectedInstanceId, activeSymbolId, timeframe])

  return {
    alerts,
    selectedAlertId,
    selectedInstanceId,
    alertsRef,
    pendingOverlayAlertRef,
    focusedInstanceIdRef,
    selectedAlertIdRef,
    wipeOverlay,
    paintOverlayIfReady,
    restoreOverlayAfterData,
    resolveMemoryFocus,
    rememberOverlay,
    setFocusSelection,
    pushPatternAlert,
    beginSeriesNavigation,
    captureKeepAlertForChartTypeSwitch,
    setPendingAlert,
    clearPendingAlert,
    clearAllAlerts,
    resetOverlayForEmptyWatchlist,
    willRestoreForCurrentSeries,
  }
}

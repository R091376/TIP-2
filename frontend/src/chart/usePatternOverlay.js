import { useEffect, useRef, useState } from 'react'
import {
  ALERTS_MAX,
  appendAlert,
  collectPinnedInstanceIds,
  compactAlerts,
  filterVisibleAlerts,
} from '../utils/alertList'
import { fetchTodayPatternAlerts } from '../services/patternAlertsApi'
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

/** Normalize API / WS alert fields for the feed. */
function normalizeAlert(raw) {
  if (!raw) return null
  const time = Number(raw.time)
  const price = Number(raw.price)
  const instanceId = raw.instanceId || raw.instance_id || ''
  const stage = (raw.stage || '').toLowerCase()
  const id =
    raw.id ||
    [instanceId || 'x', stage || 'event', time || '', price || ''].join(':')
  return {
    id,
    symbolId: raw.symbolId || raw.symbol_id,
    timeframe: raw.timeframe,
    patternType: raw.patternType || raw.pattern_type,
    stage,
    price,
    time,
    referenceLevel: raw.referenceLevel ?? raw.reference_level,
    instanceId,
    direction: raw.direction,
    status: raw.status,
    receivedAt: Number(raw.receivedAt ?? raw.received_at) || Date.now(),
  }
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
  /** True when a price line / markers handle is currently on the chart. */
  const [hasChartDrawings, setHasChartDrawings] = useState(false)
  /** True after a successful HTTP fetch (empty is a valid quiet IST day). */
  const dayAlertsLoadedRef = useRef(false)
  /** Generation token so remounts supersede in-flight requests (StrictMode-safe). */
  const dayAlertsGenRef = useRef(0)

  alertsRef.current = alerts
  selectedAlertIdRef.current = selectedAlertId
  focusedInstanceIdRef.current = selectedInstanceId

  function mergeDayAlerts(items) {
    if (!items?.length) return
    setAlerts((prev) => {
      const byId = new Map()
      // History first, then live (live overwrites same id). Include expired.
      for (const a of items) {
        const n = normalizeAlert(a)
        if (!n?.id) continue
        byId.set(n.id, n)
      }
      for (const a of prev || []) {
        if (!a?.id) continue
        byId.set(a.id, a)
      }
      const merged = [...byId.values()].sort((a, b) => {
        const ta = Number(a.time) || 0
        const tb = Number(b.time) || 0
        if (tb !== ta) return tb - ta
        return (Number(b.receivedAt) || 0) - (Number(a.receivedAt) || 0)
      })
      const next = compactAlerts(filterVisibleAlerts(merged), {
        max: Math.max(ALERTS_MAX, 300),
        pinnedInstanceIds: collectPinnedInstanceIds(
          focusedInstanceIdRef.current,
          overlayMemoryRef.current,
        ),
      })
      alertsRef.current = next
      return next
    })
  }

  /**
   * Hydrate alerts from Postgres for the IST calendar day.
   *
   * Cold-start / DB readiness is handled by the startup gate *before* login.
   * Here we only fetch once the user is already in the app: no empty-result
   * cold-start loops. One retry on hard network/HTTP error only.
   */
  async function hydrateDayAlerts() {
    if (dayAlertsLoadedRef.current) return 'ok'

    const gen = ++dayAlertsGenRef.current
    const attempt = async () => {
      const items = await fetchTodayPatternAlerts({ limit: 500 })
      if (gen !== dayAlertsGenRef.current) return 'stale'
      mergeDayAlerts(items)
      dayAlertsLoadedRef.current = true
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info(
          '[alerts] hydrated day alerts:',
          Array.isArray(items) ? items.length : 0,
        )
      }
      return 'ok'
    }

    try {
      return await attempt()
    } catch (err) {
      if (gen !== dayAlertsGenRef.current) return 'stale'
      // Single retry for a transient network glitch — not free-tier wake.
      try {
        await new Promise((r) => setTimeout(r, 400))
        if (gen !== dayAlertsGenRef.current) return 'stale'
        return await attempt()
      } catch (err2) {
        if (gen !== dayAlertsGenRef.current) return 'stale'
        // eslint-disable-next-line no-console
        console.warn('[alerts] failed to load day alerts', err2 || err)
        return 'error'
      }
    }
  }

  // Fetch as soon as the chart page mounts. Do not wait for candle bootstrap
  // (slow PENDING/seed) — that is unrelated to API cold start.
  useEffect(() => {
    void hydrateDayAlerts()
    return () => {
      dayAlertsGenRef.current += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function wipeOverlay() {
    clearPatternOverlay(overlayHandleRef.current)
    overlayHandleRef.current = null
    setHasChartDrawings(false)
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
    // Default: do not zoom/scale candles when painting overlays (alert click UX).
    const focusView = opts.focusView === true
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
      setHasChartDrawings(true)
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
    setHasChartDrawings(false)
    return false
  }

  function restoreOverlayAfterData(opts = {}) {
    const focusView = opts.focusView === true
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
    const alert = normalizeAlert({
      ...message,
      receivedAt: message.receivedAt ?? Date.now(),
    })
    if (!alert?.symbolId || !alert?.timeframe || alert.time == null) return
    if (alert.price == null || Number.isNaN(Number(alert.price))) return

    setAlerts((prev) => {
      const next = appendAlert(prev, alert, {
        max: Math.max(ALERTS_MAX, 300),
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

  /** Clear the alerts feed list only — leaves chart drawings intact. */
  function clearAllAlerts() {
    setAlerts([])
    alertsRef.current = []
    setSelectedAlertId(null)
    selectedAlertIdRef.current = null
    // Keep focusedInstanceId / drawings until clearChartDrawings()
  }

  /** Remove reference line + markers from the chart; does not clear the alerts list. */
  function clearChartDrawings() {
    pendingOverlayAlertRef.current = null
    lastPaintedInstanceSigRef.current = ''
    overlayMemoryRef.current.clear()
    focusedInstanceIdRef.current = null
    setFocusSelection(null)
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
    hasChartDrawings,
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
    clearChartDrawings,
    resetOverlayForEmptyWatchlist,
    willRestoreForCurrentSeries,
    hydrateDayAlerts,
  }
}

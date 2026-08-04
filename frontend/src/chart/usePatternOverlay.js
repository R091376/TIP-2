import { useEffect, useRef, useState } from 'react'
import {
  ALERTS_MAX,
  appendAlert,
  collectPinnedInstanceIds,
  compactAlerts,
  filterVisibleAlerts,
} from '../utils/alertList'
import { fetchTodayPatternAlerts } from '../services/patternAlertsApi'
import { fetchPatternInstance } from '../services/patternInstancesApi'
import {
  applyInstanceOverlay,
  clearPatternOverlay,
  collectInstanceEvents,
  findAlertAtChartTime,
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function optionalNum(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Normalize API / WS alert fields for the feed.
 * Rails (entry/stop/target/ATR) are frozen at detect — present for DET and later stages.
 */
function normalizeAlert(raw) {
  if (!raw) return null
  const time = Number(raw.time)
  const price = Number(raw.price)
  let instanceId = raw.instanceId || raw.instance_id || ''
  // Legacy WS used `id` as instance UUID without instanceId
  if (!instanceId && raw.id && UUID_RE.test(String(raw.id))) {
    instanceId = String(raw.id)
  }
  const stage = (raw.stage || '').toLowerCase()
  const id =
    raw.id && !UUID_RE.test(String(raw.id))
      ? raw.id
      : [instanceId || 'x', stage || 'event', time || '', price || ''].join(':')
  return {
    id,
    symbolId: raw.symbolId || raw.symbol_id,
    timeframe: raw.timeframe,
    patternType: raw.patternType || raw.pattern_type,
    stage,
    price,
    time,
    referenceLevel: optionalNum(raw.referenceLevel ?? raw.reference_level),
    instanceId,
    direction: raw.direction,
    status: raw.status,
    receivedAt: Number(raw.receivedAt ?? raw.received_at) || Date.now(),
    // Rails — available from detect (not only success/fail)
    entryPrice: optionalNum(raw.entryPrice ?? raw.entry_price),
    stopLevel: optionalNum(raw.stopLevel ?? raw.stop_level),
    targetLevel: optionalNum(raw.targetLevel ?? raw.target_level),
    atrAtDetect: optionalNum(raw.atrAtDetect ?? raw.atr_at_detect),
  }
}

/** Build a minimal instance DTO from alert-embedded rails (works on DET). */
function instanceFromAlertRails(alert) {
  if (!alert?.instanceId) return null
  const hasRails =
    alert.entryPrice != null ||
    alert.stopLevel != null ||
    alert.targetLevel != null ||
    alert.atrAtDetect != null
  if (!hasRails) return null
  return {
    id: String(alert.instanceId),
    symbolId: alert.symbolId,
    timeframe: alert.timeframe,
    patternType: alert.patternType,
    direction: alert.direction,
    stage: alert.stage || alert.status || 'detected',
    status: alert.status || alert.stage || 'detected',
    referenceLevel: alert.referenceLevel,
    entryPrice: alert.entryPrice,
    stopLevel: alert.stopLevel,
    targetLevel: alert.targetLevel,
    atrAtDetect: alert.atrAtDetect,
    terminal: ['succeeded', 'failed', 'expired'].includes(
      String(alert.stage || '').toLowerCase(),
    ),
    active: !['succeeded', 'failed', 'expired'].includes(
      String(alert.stage || '').toLowerCase(),
    ),
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
  /** Cache full instance DTOs by id (rails / ATR). */
  const instanceCacheRef = useRef(new Map())
  const instanceLoadGenRef = useRef(0)
  /** Latest rails used for paint (so live stage refresh keeps stop/target lines). */
  const railsRef = useRef(null)
  const focusAlertRef = useRef(null)

  const [alerts, setAlerts] = useState([])
  const [selectedAlertId, setSelectedAlertId] = useState(null)
  const [selectedInstanceId, setSelectedInstanceId] = useState(null)
  /** True when a price line / markers handle is currently on the chart. */
  const [hasChartDrawings, setHasChartDrawings] = useState(false)
  /** Full instance for inspect panel (entry/stop/target/ATR…). */
  const [focusedInstance, setFocusedInstance] = useState(null)
  const [instanceLoading, setInstanceLoading] = useState(false)
  const [instanceError, setInstanceError] = useState(null)
  /** Alert currently driving the inspect panel (React state for re-render). */
  const [focusedAlert, setFocusedAlert] = useState(null)
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

  function clearInstanceInspect() {
    instanceLoadGenRef.current += 1
    railsRef.current = null
    focusAlertRef.current = null
    setFocusedAlert(null)
    setFocusedInstance(null)
    setInstanceLoading(false)
    setInstanceError(null)
  }

  function railsFromInstance(inst) {
    if (!inst) return null
    return {
      reference: inst.referenceLevel,
      entry: inst.entryPrice,
      stop: inst.stopLevel,
      target: inst.targetLevel,
    }
  }

  function railsFromAlert(alert) {
    if (!alert) return null
    const has =
      alert.entryPrice != null ||
      alert.stopLevel != null ||
      alert.targetLevel != null ||
      alert.referenceLevel != null
    if (!has) return null
    return {
      reference: alert.referenceLevel,
      entry: alert.entryPrice,
      stop: alert.stopLevel,
      target: alert.targetLevel,
    }
  }

  /**
   * Load full instance for inspect + re-paint rails when ready.
   * Rails are available from DET (not only success/fail).
   * @param {object} focusAlert
   * @param {{ silent?: boolean }} [opts]
   */
  async function loadInstanceForFocus(focusAlert, opts = {}) {
    const silent = opts.silent === true
    /** When true, skip network if alert already has rails or cache is warm. */
    const networkIfNeeded = opts.networkIfNeeded !== false
    if (!focusAlert?.instanceId || !focusAlert?.symbolId) {
      // Still show alert-embedded rails (DET) if present
      const fromAlert = instanceFromAlertRails(focusAlert)
      if (fromAlert) {
        railsRef.current = railsFromInstance(fromAlert)
        setFocusedInstance(fromAlert)
        setInstanceError(null)
        setInstanceLoading(false)
        return fromAlert
      }
      if (!silent) clearInstanceInspect()
      return null
    }
    const iid = String(focusAlert.instanceId)

    // Immediate: alert rails or cache (works for DET without waiting on network)
    const fromAlert = instanceFromAlertRails(focusAlert)
    const cached = instanceCacheRef.current.get(iid)
    const immediate = cached || fromAlert
    if (immediate) {
      railsRef.current = railsFromInstance(immediate)
      setFocusedInstance(immediate)
      setInstanceError(null)
      setInstanceLoading(false)
      if (
        focusedInstanceIdRef.current === iid &&
        seriesRef.current &&
        chartRef.current
      ) {
        paintOverlayIfReady(focusAlert, { focusView: false, skipInstanceLoad: true })
      }
    }

    // Alert rails + cache are enough for DET inspect; still refresh once when no cache
    // (lifecycle MFE/MAE). Never multi-list fan-out — single instanceId GET.
    if (!networkIfNeeded) return immediate || null
    if (cached && !opts.forceRefresh) {
      // Background refresh once in a while is optional; skip for stage repaints.
      return cached
    }

    const gen = ++instanceLoadGenRef.current
    if (!silent && !immediate) {
      setInstanceLoading(true)
      setInstanceError(null)
    }
    try {
      const inst = await fetchPatternInstance(
        focusAlert.symbolId,
        iid,
        focusAlert.timeframe,
      )
      if (gen !== instanceLoadGenRef.current) return null
      if (!inst) {
        if (!immediate) {
          setFocusedInstance(null)
          setInstanceError('Instance rails not found (may be outside recent journal window).')
        }
        setInstanceLoading(false)
        return immediate || null
      }
      instanceCacheRef.current.set(iid, inst)
      railsRef.current = railsFromInstance(inst)
      setFocusedInstance(inst)
      setInstanceError(null)
      setInstanceLoading(false)
      if (
        focusedInstanceIdRef.current === iid &&
        seriesRef.current &&
        chartRef.current
      ) {
        paintOverlayIfReady(focusAlert, { focusView: false, skipInstanceLoad: true })
      }
      return inst
    } catch (e) {
      if (gen !== instanceLoadGenRef.current) return null
      if (!immediate) {
        setFocusedInstance(null)
        setInstanceError(e instanceof Error ? e.message : 'Failed to load instance')
      }
      setInstanceLoading(false)
      return immediate || null
    }
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
      focusAlertRef.current = null
      setSelectedAlertId(null)
      setSelectedInstanceId(null)
      setFocusedAlert(null)
      return
    }
    selectedAlertIdRef.current = focusAlert.id
    focusedInstanceIdRef.current = focusAlert.instanceId || null
    focusAlertRef.current = focusAlert
    setSelectedAlertId(focusAlert.id)
    setSelectedInstanceId(focusAlert.instanceId || null)
    setFocusedAlert(focusAlert)
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

    // Prefer rails: cache → alert-embedded (DET+) → last load
    let rails = railsRef.current
    const iid = focusAlert.instanceId ? String(focusAlert.instanceId) : null
    if (iid) {
      const cached = instanceCacheRef.current.get(iid)
      if (cached) {
        rails = railsFromInstance(cached)
        railsRef.current = rails
      }
    }
    if (!rails) {
      rails = railsFromAlert(focusAlert)
      if (rails) railsRef.current = rails
    }

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
      rails,
    })

    if (overlayHandleRef.current) {
      setHasChartDrawings(true)
      setFocusSelection(focusAlert)
      // Show inspect immediately from alert rails (including DET)
      const quick = instanceFromAlertRails(focusAlert)
      if (quick && !instanceCacheRef.current.get(String(focusAlert.instanceId || ''))) {
        setFocusedInstance(quick)
        setInstanceError(null)
      }
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
      if (!opts.skipInstanceLoad) {
        void loadInstanceForFocus(focusAlert)
      }
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
    clearInstanceInspect()

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
    clearInstanceInspect()
    wipeOverlay()
  }

  function resetOverlayForEmptyWatchlist() {
    pendingOverlayAlertRef.current = null
    lastPaintedInstanceSigRef.current = ''
    setFocusSelection(null)
    clearInstanceInspect()
    wipeOverlay()
  }

  /** Close inspect panel only (keeps chart drawings unless caller also clears). */
  function closeInstanceInspect() {
    clearInstanceInspect()
  }

  /**
   * Chart click: only hit when click lands on the same series bar as a stage event.
   * If an overlay is painted, further restrict to that instance's marker bars.
   */
  function handleChartClick(param) {
    if (disposedRef.current) return
    if (param?.time == null) return
    const chartTime = Number(param.time)
    if (!Number.isFinite(chartTime)) return
    const candles = sortedCandlesFromMap(candlesRef.current)
    const seriesTimes = seriesChartTimesFromCandles(candles)
    const painted = overlayHandleRef.current
    const markerTimes = Array.isArray(painted?.markerChartTimes)
      ? painted.markerChartTimes
      : null
    const hit = findAlertAtChartTime(alertsRef.current, chartTime, {
      symbolId: activeSymbolIdRef.current,
      timeframe: timeframeRef.current,
      preferredInstanceId: focusedInstanceIdRef.current,
      seriesChartTimes: seriesTimes,
      // When markers are painted, only those bars are clickable (avoids random steals).
      // When none painted, any day-alert bar for the series is fair game.
      markerChartTimes: markerTimes && markerTimes.length ? markerTimes : null,
    })
    if (!hit) return
    paintOverlayIfReady(hit, { focusView: false })
  }

  // Subscribe chart click for marker / bar inspect (rebind when series context changes).
  useEffect(() => {
    if (loading) return undefined
    const chart = chartRef.current
    if (!chart || typeof chart.subscribeClick !== 'function') return undefined
    const handler = (param) => handleChartClick(param)
    chart.subscribeClick(handler)
    return () => {
      try {
        chart.unsubscribeClick(handler)
      } catch {
        // disposed
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handler uses refs
  }, [loading, activeSymbolId, timeframe])

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
    // Stage-only repaint: keep rails/cache; do not re-fetch instance (avoids list fan-out).
    paintOverlayIfReady(focus, { focusView: false, skipInstanceLoad: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paint uses refs; alerts/selection drive refresh
  }, [alerts, loading, selectedInstanceId, activeSymbolId, timeframe])

  return {
    alerts,
    selectedAlertId,
    selectedInstanceId,
    hasChartDrawings,
    focusedInstance,
    instanceLoading,
    instanceError,
    focusedAlert,
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
    closeInstanceInspect,
    resetOverlayForEmptyWatchlist,
    willRestoreForCurrentSeries,
    hydrateDayAlerts,
  }
}

/**
 * Lightweight Charts engine: series, panes, bulk setData, type switch.
 * ChartContainer owns session/watchlist; this hook owns LWC mutations.
 */
import { useCallback, useRef, useState } from 'react'
import {
  applyBarSpacing,
  applySubpaneVisibility,
  applyVolumePaneHeight,
  createAtrSeries,
  createPriceSeries,
  createVolumeSeries,
  createVolumeSmaSeries,
  lastAtrPoint,
  lastVolumeSmaPoint,
  latestCandleFromMap,
  rebalancePriceVolumePanes,
  sanitizeAtrPoints,
  sanitizeSeriesPoints,
  sanitizeVolumePoints,
  sanitizeVolumeSmaPoints,
  sortedCandlesFromMap,
  toVolumePoint,
} from '../chart/helpers'

const LS_SHOW_ATR = 'tip.chart.showAtr'
const LS_SHOW_VOLUME = 'tip.chart.showVolume'

function readBoolPref(key, fallback = true) {
  try {
    const v = localStorage.getItem(key)
    if (v === null || v === undefined) return fallback
    return v === '1' || v === 'true'
  } catch {
    return fallback
  }
}

function writeBoolPref(key, value) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // ignore
  }
}

/**
 * @param {{
 *   chartTypeRef: React.MutableRefObject<string>,
 *   overlay: { wipeOverlay: Function, willRestoreForCurrentSeries: Function, restoreOverlayAfterData: Function, captureKeepAlertForChartTypeSwitch: Function, setPendingAlert: Function },
 * }} opts
 */
export function useChartEngine({ chartTypeRef, overlay }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const atrSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const volumeSmaSeriesRef = useRef(null)
  const candlesRef = useRef(new Map())
  const ohlcHoveringRef = useRef(false)
  const loadedSeriesKeyRef = useRef(null)
  /** Stable bridge — ChartContainer may pass a new overlay object each render. */
  const overlayRef = useRef(overlay)
  overlayRef.current = overlay

  const [ohlcLegend, setOhlcLegend] = useState(null)
  const [showAtr, setShowAtrState] = useState(() => readBoolPref(LS_SHOW_ATR, true))
  const [showVolume, setShowVolumeState] = useState(() =>
    readBoolPref(LS_SHOW_VOLUME, true),
  )
  const showAtrRef = useRef(showAtr)
  const showVolumeRef = useRef(showVolume)
  showAtrRef.current = showAtr
  showVolumeRef.current = showVolume

  const visibilityOpts = useCallback(
    () => ({
      showAtr: showAtrRef.current,
      showVolume: showVolumeRef.current,
    }),
    [],
  )

  const rebalancePanes = useCallback(
    (chart, priceSeries, containerHeight) => {
      rebalancePriceVolumePanes(
        chart,
        priceSeries,
        volumeSeriesRef.current,
        volumeSmaSeriesRef.current,
        containerHeight,
        atrSeriesRef.current,
        visibilityOpts(),
      )
    },
    [visibilityOpts],
  )

  /** Resize / bootstrap: apply current ATR/volume visibility + heights. */
  const layoutSubpanes = useCallback(
    (chart, containerHeight) => {
      const c = chart ?? chartRef.current
      const h =
        containerHeight ??
        containerRef.current?.clientHeight ??
        0
      if (!c) return
      applySubpaneVisibility(
        {
          atr: atrSeriesRef.current,
          volume: volumeSeriesRef.current,
          volumeSma: volumeSmaSeriesRef.current,
        },
        visibilityOpts(),
      )
      applyVolumePaneHeight(c, h, visibilityOpts())
    },
    [visibilityOpts],
  )

  const setShowAtr = useCallback(
    (next) => {
      const v = Boolean(next)
      showAtrRef.current = v
      setShowAtrState(v)
      writeBoolPref(LS_SHOW_ATR, v)
      layoutSubpanes()
    },
    [layoutSubpanes],
  )

  const setShowVolume = useCallback(
    (next) => {
      const v = Boolean(next)
      showVolumeRef.current = v
      setShowVolumeState(v)
      writeBoolPref(LS_SHOW_VOLUME, v)
      layoutSubpanes()
    },
    [layoutSubpanes],
  )

  const toggleAtrPane = useCallback(() => {
    setShowAtr(!showAtrRef.current)
  }, [setShowAtr])

  const toggleVolumePane = useCallback(() => {
    setShowVolume(!showVolumeRef.current)
  }, [setShowVolume])

  const applySubpaneSeriesData = useCallback((candles) => {
    try {
      atrSeriesRef.current?.setData(sanitizeAtrPoints(candles))
      volumeSeriesRef.current?.setData(sanitizeVolumePoints(candles))
      volumeSmaSeriesRef.current?.setData(sanitizeVolumeSmaPoints(candles))
    } catch {
      // ignore degenerate subpane scales
    }
  }, [])

  const syncOhlcLegendFromLatest = useCallback(() => {
    if (ohlcHoveringRef.current) return
    setOhlcLegend(latestCandleFromMap(candlesRef.current))
  }, [])

  /** Live update volume + ATR after candle upsert (price series updated by caller). */
  const updateVolumeLive = useCallback(
    (candle) => {
      const candles = sortedCandlesFromMap(candlesRef.current)
      try {
        volumeSeriesRef.current?.update(toVolumePoint(candle))
        const smaPoint = lastVolumeSmaPoint(candles)
        if (smaPoint) {
          volumeSmaSeriesRef.current?.update(smaPoint)
        }
        const atrPoint = lastAtrPoint(candles)
        if (atrPoint) {
          atrSeriesRef.current?.update(atrPoint)
        }
      } catch {
        applySubpaneSeriesData(candles)
      }
    },
    [applySubpaneSeriesData],
  )

  const applySeriesData = useCallback(
    (
      series,
      type,
      {
        resetView = true,
        preserveLogicalRange = null,
        /** When false, wipe + setData only — used while clearing before candles arrive. */
        restoreOverlay = true,
      } = {},
    ) => {
      const candles = sortedCandlesFromMap(candlesRef.current)
      const ov = overlayRef.current
      ov.wipeOverlay()
      const pricePoints = sanitizeSeriesPoints(type, candles)
      try {
        series.setData(pricePoints)
      } catch (err) {
        console.warn('Price series setData failed', err)
        try {
          series.setData([])
        } catch {
          // ignore
        }
      }
      applySubpaneSeriesData(candles)

      const chart = chartRef.current
      const h = containerRef.current?.clientHeight ?? 0
      rebalancePanes(chart, series, h)

      const restoring = restoreOverlay && ov.willRestoreForCurrentSeries()

      if (resetView) {
        ohlcHoveringRef.current = false
        try {
          series.priceScale().applyOptions({ autoScale: true })
          atrSeriesRef.current?.priceScale().applyOptions({ autoScale: true })
          volumeSeriesRef.current?.priceScale().applyOptions({ autoScale: true })
        } catch {
          // ignore
        }
        if (chart && pricePoints.length > 0) {
          applyBarSpacing(chart)
          if (preserveLogicalRange) {
            try {
              chart.timeScale().setVisibleLogicalRange(preserveLogicalRange)
            } catch {
              try {
                chart.timeScale().scrollToRealTime()
              } catch {
                // ignore
              }
            }
          } else if (!restoring) {
            try {
              chart.timeScale().scrollToRealTime()
            } catch {
              // ignore
            }
          }
          applyBarSpacing(chart)
        }
        rebalancePanes(chart, series, h)
      } else {
        applyBarSpacing(chart)
      }
      if (!ohlcHoveringRef.current) {
        setOhlcLegend(candles.length ? candles[candles.length - 1] : null)
      }
      if (restoreOverlay) {
        // Never zoom for overlay restore — preserves bar size after alert navigation.
        ov.restoreOverlayAfterData({ focusView: false })
      }
    },
    [applySubpaneSeriesData, rebalancePanes],
  )

  const switchChartType = useCallback(
    (type) => {
      const chart = chartRef.current
      if (!chart) return

      let logicalRange = null
      try {
        logicalRange = chart.timeScale().getVisibleLogicalRange()
      } catch {
        logicalRange = null
      }

      const ov = overlayRef.current
      const keepAlert = ov.captureKeepAlertForChartTypeSwitch()
      ov.wipeOverlay()
      if (seriesRef.current) {
        try {
          chart.removeSeries(seriesRef.current)
        } catch {
          // ignore
        }
      }

      const series = createPriceSeries(chart, type)
      seriesRef.current = series
      if (keepAlert) {
        ov.setPendingAlert(keepAlert)
      }
      applySeriesData(series, type, {
        resetView: true,
        preserveLogicalRange: logicalRange,
      })
      requestAnimationFrame(() => {
        const c = chartRef.current
        const h = containerRef.current?.clientHeight ?? 0
        rebalancePanes(c, seriesRef.current, h)
        applyBarSpacing(c)
      })
    },
    [applySeriesData, rebalancePanes],
  )

  function upsertCandle(candle) {
    candlesRef.current.set(candle.time, candle)
  }

  /**
   * Clear candles for an upcoming series load. Does not set loadedSeriesKey and does
   * not restore overlays — that happens only after candles land in loadCandles.
   */
  function clearSeriesDataFor(_symbolId, _tf) {
    candlesRef.current.clear()
    // Leave loadedSeriesKey pointing at previous series until real data arrives so
    // paintOverlayIfReady refuses empty paints. Callers set the key in loadCandles.
    loadedSeriesKeyRef.current = null
    if (seriesRef.current) {
      applySeriesData(seriesRef.current, chartTypeRef.current, {
        restoreOverlay: false,
      })
    }
  }

  function mountSeries(chart, chartType) {
    seriesRef.current = createPriceSeries(chart, chartType)
    // Order: ATR pane 1, then volume pane 2 (LWC creates panes as series are added).
    atrSeriesRef.current = createAtrSeries(chart)
    volumeSeriesRef.current = createVolumeSeries(chart)
    volumeSmaSeriesRef.current = createVolumeSmaSeries(chart)
    applySeriesData(seriesRef.current, chartType)
    const initialHeight = containerRef.current?.clientHeight ?? 0
    layoutSubpanes(chart, initialHeight)
  }

  function clearEngineRefs() {
    chartRef.current = null
    seriesRef.current = null
    atrSeriesRef.current = null
    volumeSeriesRef.current = null
    volumeSmaSeriesRef.current = null
    ohlcHoveringRef.current = false
  }

  return {
    containerRef,
    chartRef,
    seriesRef,
    atrSeriesRef,
    volumeSeriesRef,
    volumeSmaSeriesRef,
    candlesRef,
    ohlcHoveringRef,
    loadedSeriesKeyRef,
    ohlcLegend,
    setOhlcLegend,
    showAtr,
    showVolume,
    setShowAtr,
    setShowVolume,
    toggleAtrPane,
    toggleVolumePane,
    layoutSubpanes,
    applySeriesData,
    switchChartType,
    upsertCandle,
    updateVolumeLive,
    syncOhlcLegendFromLatest,
    clearSeriesDataFor,
    mountSeries,
    clearEngineRefs,
    applyVolumeSeriesData: applySubpaneSeriesData,
  }
}

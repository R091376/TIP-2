/**
 * Lightweight Charts engine: series, panes, bulk setData, type switch.
 * ChartContainer owns session/watchlist; this hook owns LWC mutations.
 */
import { useCallback, useRef, useState } from 'react'
import {
  applyBarSpacing,
  applyVolumePaneHeight,
  createPriceSeries,
  createVolumeSeries,
  createVolumeSmaSeries,
  lastVolumeSmaPoint,
  latestCandleFromMap,
  rebalancePriceVolumePanes,
  sanitizeSeriesPoints,
  sanitizeVolumePoints,
  sanitizeVolumeSmaPoints,
  sortedCandlesFromMap,
  toVolumePoint,
} from '../chart/helpers'

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
  const volumeSeriesRef = useRef(null)
  const volumeSmaSeriesRef = useRef(null)
  const candlesRef = useRef(new Map())
  const ohlcHoveringRef = useRef(false)
  const loadedSeriesKeyRef = useRef(null)
  /** Stable bridge — ChartContainer may pass a new overlay object each render. */
  const overlayRef = useRef(overlay)
  overlayRef.current = overlay

  const [ohlcLegend, setOhlcLegend] = useState(null)

  const applyVolumeSeriesData = useCallback((candles) => {
    try {
      volumeSeriesRef.current?.setData(sanitizeVolumePoints(candles))
      volumeSmaSeriesRef.current?.setData(sanitizeVolumeSmaPoints(candles))
    } catch {
      // ignore degenerate volume scales
    }
  }, [])

  const syncOhlcLegendFromLatest = useCallback(() => {
    if (ohlcHoveringRef.current) return
    setOhlcLegend(latestCandleFromMap(candlesRef.current))
  }, [])

  const updateVolumeLive = useCallback(
    (candle) => {
      try {
        volumeSeriesRef.current?.update(toVolumePoint(candle))
        const smaPoint = lastVolumeSmaPoint(sortedCandlesFromMap(candlesRef.current))
        if (smaPoint) {
          volumeSmaSeriesRef.current?.update(smaPoint)
        }
      } catch {
        applyVolumeSeriesData(sortedCandlesFromMap(candlesRef.current))
      }
    },
    [applyVolumeSeriesData],
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
      applyVolumeSeriesData(candles)

      const chart = chartRef.current
      const h = containerRef.current?.clientHeight ?? 0
      rebalancePriceVolumePanes(
        chart,
        series,
        volumeSeriesRef.current,
        volumeSmaSeriesRef.current,
        h,
      )

      const restoring = restoreOverlay && ov.willRestoreForCurrentSeries()

      if (resetView) {
        ohlcHoveringRef.current = false
        try {
          series.priceScale().applyOptions({ autoScale: true })
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
        rebalancePriceVolumePanes(
          chart,
          series,
          volumeSeriesRef.current,
          volumeSmaSeriesRef.current,
          h,
        )
      } else {
        applyBarSpacing(chart)
      }
      if (!ohlcHoveringRef.current) {
        setOhlcLegend(candles.length ? candles[candles.length - 1] : null)
      }
      if (restoreOverlay) {
        ov.restoreOverlayAfterData({ focusView: resetView })
      }
    },
    [applyVolumeSeriesData],
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
        rebalancePriceVolumePanes(
          c,
          seriesRef.current,
          volumeSeriesRef.current,
          volumeSmaSeriesRef.current,
          h,
        )
        applyBarSpacing(c)
      })
    },
    [applySeriesData],
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
    volumeSeriesRef.current = createVolumeSeries(chart)
    volumeSmaSeriesRef.current = createVolumeSmaSeries(chart)
    applySeriesData(seriesRef.current, chartType)
    const initialHeight = containerRef.current?.clientHeight ?? 0
    applyVolumePaneHeight(chart, initialHeight)
  }

  function clearEngineRefs() {
    chartRef.current = null
    seriesRef.current = null
    volumeSeriesRef.current = null
    volumeSmaSeriesRef.current = null
    ohlcHoveringRef.current = false
  }

  return {
    containerRef,
    chartRef,
    seriesRef,
    volumeSeriesRef,
    volumeSmaSeriesRef,
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
    applyVolumeSeriesData,
  }
}

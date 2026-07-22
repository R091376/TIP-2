/**
 * Mount-time chart page bootstrap: watchlist + market status, LWC chart, live socket.
 */
import { useEffect } from 'react'
import { createChart } from 'lightweight-charts'
import {
  DEFAULT_TIMEFRAME,
  DEFAULT_TIMEFRAMES,
  fetchMarketStatus,
  fetchTimeframes,
} from '../services/marketApi'
import { fetchWatchlist } from '../services/watchlistApi'
import { createLiveSocket } from '../services/liveSocket'
import {
  applyVolumePaneHeight,
  defaultChartOptions,
  findCandleByChartTime,
  latestCandleFromMap,
  MARKET_CLOSED_MSG,
  normalizeStatus,
} from '../chart/helpers'
import { failedBannerForEntry, infoAfterCandleLoad } from '../chart/sessionMessages'

/**
 * @param {object} opts
 */
export function useChartBootstrap({
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
}) {
  useEffect(() => {
    let cancelled = false
    disposedRef.current = false
    let resizeObserver = null
    let pollTimer = null
    let localSocket = null
    let localChart = null
    const isStale = () => cancelled || disposedRef.current

    async function init() {
      try {
        const [list, status, tfInfo] = await Promise.all([
          fetchWatchlist(),
          fetchMarketStatus(),
          fetchTimeframes(),
        ])
        if (isStale()) return

        const supported = tfInfo.supported?.length
          ? tfInfo.supported
          : [...DEFAULT_TIMEFRAMES]
        // Optional deep-link from pattern stats: /?symbol=...&tf=5m
        let deepSymbol = null
        let deepTf = null
        try {
          const sp = new URLSearchParams(window.location.search)
          deepSymbol = sp.get('symbol')
          deepTf = sp.get('tf')
        } catch {
          /* ignore */
        }
        const preferredTf =
          deepTf && supported.includes(deepTf)
            ? deepTf
            : supported.includes(tfInfo.defaultTimeframe)
              ? tfInfo.defaultTimeframe
              : supported[0] || DEFAULT_TIMEFRAME
        const initialTf = preferredTf
        setTimeframes(supported)
        setTimeframe(initialTf)
        timeframeRef.current = initialTf
        marketPhaseRef.current = status.marketPhase?.toLowerCase() ?? 'unknown'

        let entries = Array.isArray(list) ? list : []
        setWatchlist(entries)
        watchlistRef.current = entries

        const globalFailed = normalizeStatus(status.bootstrapStatus) === 'FAILED'
        const anyUsable = entries.some((e) => normalizeStatus(e.bootstrapStatus) !== 'FAILED')
        if (globalFailed && (!entries.length || !anyUsable)) {
          setError(status.bootstrapError || 'Failed to connect to Upstox.')
          setLoading(false)
          updateConnectionStatus('error', marketPhaseRef.current)
          return
        }

        let polls = 0
        while (
          !isStale() &&
          entries.length > 0 &&
          !entries.some((e) => normalizeStatus(e.bootstrapStatus) === 'READY') &&
          entries.some((e) => normalizeStatus(e.bootstrapStatus) === 'PENDING') &&
          polls < 120
        ) {
          setInfoMessage('Loading market data…')
          await new Promise((r) => {
            pollTimer = setTimeout(r, 1000)
          })
          if (isStale()) return
          try {
            entries = await fetchWatchlist()
            if (isStale()) return
            setWatchlist(entries)
            watchlistRef.current = entries
            const st = await fetchMarketStatus()
            if (isStale()) return
            marketPhaseRef.current = st.marketPhase?.toLowerCase() ?? marketPhaseRef.current
          } catch {
            /* keep polling */
          }
          polls += 1
        }
        if (isStale()) return

        const deepEntry = deepSymbol
          ? entries.find((e) => e.symbolId === deepSymbol) || null
          : null
        const primary =
          deepEntry ||
          entries.find((e) => normalizeStatus(e.bootstrapStatus) === 'READY') ||
          entries[0] ||
          null
        if (!primary) {
          setError('Watchlist is empty. Add a symbol to begin.')
          setLoading(false)
          updateConnectionStatus('error', marketPhaseRef.current)
          return
        }

        setActiveSymbolId(primary.symbolId)
        activeSymbolIdRef.current = primary.symbolId
        const failMsg = failedBannerForEntry(primary)
        if (failMsg) setError(failMsg)
        else setError(null)

        if (marketPhaseRef.current === 'closed') setInfoMessage(MARKET_CLOSED_MSG)
        else if (normalizeStatus(primary.bootstrapStatus) === 'PENDING')
          setInfoMessage('Loading market data…')
        else setInfoMessage(null)

        const generation = ++loadGenerationRef.current
        if (normalizeStatus(primary.bootstrapStatus) === 'READY') {
          try {
            const candles = await loadCandles(primary.symbolId, initialTf, generation)
            if (isStale() || candles === null) return
            setInfoMessage(infoAfterCandleLoad(candles, marketPhaseRef.current))
          } catch (err) {
            if (!isStale())
              setError(err instanceof Error ? err.message : 'Failed to load candles')
          }
        } else if (normalizeStatus(primary.bootstrapStatus) === 'PENDING') {
          candlesRef.current.clear()
          loadedSeriesKeyRef.current = null
        }

        if (isStale() || !containerRef.current) return

        const chart = createChart(containerRef.current, defaultChartOptions())
        localChart = chart
        chartRef.current = chart
        mountSeries(chart, chartTypeRef.current)
        applyVolumePaneHeight(chart, containerRef.current?.clientHeight ?? 0)

        chart.subscribeCrosshairMove((param) => {
          if (isStale()) return
          const left =
            param.point === undefined ||
            param.time === undefined ||
            param.point.x < 0 ||
            param.point.y < 0
          if (left) {
            ohlcHoveringRef.current = false
            setOhlcLegend(latestCandleFromMap(candlesRef.current))
            return
          }
          const candle = findCandleByChartTime(candlesRef.current, param.time)
          if (candle) {
            ohlcHoveringRef.current = true
            setOhlcLegend(candle)
          }
        })

        resizeObserver = new ResizeObserver((entriesRo) => {
          const { width, height } = entriesRo[0].contentRect
          chart.applyOptions({ width, height })
          applyVolumePaneHeight(chart, height)
        })
        resizeObserver.observe(containerRef.current)

        localSocket = createLiveSocket({
          symbolId: primary.symbolId,
          timeframe: initialTf,
          onStatus: (wsStatus, message) => {
            if (isStale()) return
            onLiveStatus(wsStatus, message)
          },
          onMessage: onLiveMessage,
        })
        socketRef.current = localSocket

        if (isStale()) {
          try {
            localSocket.close()
          } catch {
            /* ignore */
          }
          try {
            resizeObserver?.disconnect()
          } catch {
            /* ignore */
          }
          try {
            chart.remove()
          } catch {
            /* ignore */
          }
          clearEngineRefs()
          return
        }

        updateConnectionStatus('connecting', marketPhaseRef.current)
        setLoading(false)
      } catch (err) {
        if (!isStale()) {
          setError(err instanceof Error ? err.message : 'Failed to load chart data')
          setLoading(false)
          updateConnectionStatus('error', marketPhaseRef.current)
        }
      }
    }

    init()
    return () => {
      cancelled = true
      disposedRef.current = true
      loadGenerationRef.current += 1
      if (pollTimer) clearTimeout(pollTimer)
      try {
        localSocket?.close()
      } catch {
        /* ignore */
      }
      try {
        if (socketRef.current && socketRef.current !== localSocket) socketRef.current.close()
      } catch {
        /* ignore */
      }
      socketRef.current = null
      try {
        resizeObserver?.disconnect()
      } catch {
        /* ignore */
      }
      const chartToRemove = localChart || chartRef.current
      clearEngineRefs()
      if (chartToRemove) {
        try {
          chartToRemove.remove()
        } catch {
          /* ignore */
        }
      }
    }
    // bootstrap intentionally once per mount identity of loadCandles / connection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateConnectionStatus, loadCandles, onLiveMessage, onLiveStatus])
}

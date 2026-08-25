import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyWoodieOverlay,
  clearWoodieOverlay,
  createWoodieHandles,
} from '../chart/woodieOverlay'
import { sortedCandlesFromMap } from '../chart/helpers'
import { fetchWoodieSr } from '../services/srApi'
import { istYmdFromUtcSeconds } from '../utils/chartTime'
import { todayIstYmd } from '../utils/researchFilters'
import { parseCtsEnd } from '../utils/woodieSr'

const LS_SHOW_WOODIE = 'tip.chart.showWoodieSr'
const LS_WOODIE_TODAY_ONLY = 'tip.chart.woodieSrTodayOnly'

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
 * Fetch frozen daily Woodie rows and paint them on the live price series.
 */
export function useWoodieSrOverlay({
  enabled = true,
  symbolId,
  timeframe,
  chartRef,
  seriesRef,
  candlesRef,
  ctsEnd,
}) {
  const [showWoodie, setShowWoodieState] = useState(() =>
    enabled ? readBoolPref(LS_SHOW_WOODIE, true) : false,
  )
  const [todayOnly, setTodayOnlyState] = useState(() =>
    readBoolPref(LS_WOODIE_TODAY_ONLY, true),
  )
  const showRef = useRef(showWoodie)
  showRef.current = showWoodie
  const todayOnlyRef = useRef(todayOnly)
  todayOnlyRef.current = todayOnly
  const daysRef = useRef([])
  const handlesRef = useRef(createWoodieHandles())

  const paint = useCallback(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!enabled || !showRef.current) {
      clearWoodieOverlay(chart, series, handlesRef.current)
      return
    }
    const candles = candlesRef?.current
      ? sortedCandlesFromMap(candlesRef.current)
      : []
    const cts = parseCtsEnd(ctsEnd)
    applyWoodieOverlay(
      chart,
      series,
      daysRef.current,
      {
        candles,
        todayOnly: todayOnlyRef.current,
        todayYmd: todayIstYmd(),
        ctsHour: cts.hour,
        ctsMinute: cts.minute,
      },
      handlesRef.current,
    )
  }, [chartRef, seriesRef, candlesRef, enabled, ctsEnd])

  const clear = useCallback(() => {
    clearWoodieOverlay(chartRef.current, seriesRef.current, handlesRef.current)
  }, [chartRef, seriesRef])

  const setShowWoodie = useCallback(
    (next) => {
      const v = Boolean(next)
      showRef.current = v
      setShowWoodieState(v)
      writeBoolPref(LS_SHOW_WOODIE, v)
      if (v) paint()
      else clear()
    },
    [paint, clear],
  )

  const toggleWoodie = useCallback(() => {
    setShowWoodie(!showRef.current)
  }, [setShowWoodie])

  const setWoodieTodayOnly = useCallback(
    (next) => {
      const v = Boolean(next)
      todayOnlyRef.current = v
      setTodayOnlyState(v)
      writeBoolPref(LS_WOODIE_TODAY_ONLY, v)
      paint()
    },
    [paint],
  )

  useEffect(() => {
    if (!enabled) {
      daysRef.current = []
      clear()
      return
    }
    if (!symbolId) return
    daysRef.current = []
    clear()
    let ac = new AbortController()
    const load = ({ replaceOnError }) => {
      ac.abort()
      ac = new AbortController()
      const candles = candlesRef?.current
        ? sortedCandlesFromMap(candlesRef.current)
        : []
      const from = candles[0] ? istYmdFromUtcSeconds(candles[0].time) : undefined
      const to = candles.length
        ? istYmdFromUtcSeconds(candles[candles.length - 1].time)
        : undefined
      fetchWoodieSr(symbolId, { from, to, signal: ac.signal })
        .then((body) => {
          if (ac.signal.aborted) return
          daysRef.current = Array.isArray(body?.levels) ? body.levels : []
          paint()
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return
          if (!replaceOnError && daysRef.current.length) return
          daysRef.current = []
          clear()
        })
    }
    load({ replaceOnError: true })
    const tick = window.setInterval(() => load({ replaceOnError: false }), 60_000)
    return () => {
      ac.abort()
      window.clearInterval(tick)
    }
  }, [enabled, symbolId, clear, paint])

  useEffect(() => {
    paint()
  }, [timeframe, paint])

  return {
    showWoodie: enabled && showWoodie,
    toggleWoodie,
    setShowWoodie,
    woodieTodayOnly: todayOnly,
    setWoodieTodayOnly,
    paintWoodie: paint,
    clearWoodie: clear,
  }
}

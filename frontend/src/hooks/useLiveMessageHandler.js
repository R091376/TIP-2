/**
 * Stable live WebSocket message router. Always reads latest engine/overlay via refs
 * so mount-time socket callbacks never capture a stale overlay object.
 */
import { useCallback, useRef } from 'react'
import {
  MARKET_CLOSED_MSG,
  toCandlestickPoint,
  toLinePoint,
} from '../chart/helpers'

/**
 * @param {{
 *   isStale: () => boolean,
 *   chartTypeRef: React.MutableRefObject<string>,
 *   timeframeRef: React.MutableRefObject<string>,
 *   activeSymbolIdRef: React.MutableRefObject<string|null>,
 *   seriesRef: React.MutableRefObject,
 *   wsStatusRef: React.MutableRefObject<string>,
 *   overlayApiRef: React.MutableRefObject,
 *   upsertCandle: Function,
 *   updateVolumeLive: Function,
 *   syncOhlcLegendFromLatest: Function,
 *   applySeriesData: Function,
 *   updateConnectionStatus: Function,
 *   setInfoMessage: Function,
 * }} deps
 */
export function useLiveMessageHandler(deps) {
  const depsRef = useRef(deps)
  depsRef.current = deps

  return useCallback((message) => {
    const d = depsRef.current
    if (d.isStale()) return

    if (message.type === 'market_status') {
      d.updateConnectionStatus(d.wsStatusRef.current, message.marketPhase)
      if (message.marketPhase === 'closed') d.setInfoMessage(MARKET_CLOSED_MSG)
      else d.setInfoMessage((prev) => (prev === MARKET_CLOSED_MSG ? null : prev))
      return
    }

    if (message.type === 'pattern_event') {
      d.overlayApiRef.current.pushPatternAlert?.(message)
      return
    }

    if (message.type === 'candle_update' || message.type === 'candle_closed') {
      if (message.symbolId !== d.activeSymbolIdRef.current) return
      if (message.timeframe !== d.timeframeRef.current) return
      if (!message.candle) return
      const candle = message.candle
      d.upsertCandle(candle)
      try {
        d.seriesRef.current?.update(
          d.chartTypeRef.current === 'line'
            ? toLinePoint(candle)
            : toCandlestickPoint(candle),
        )
        d.updateVolumeLive(candle)
        d.syncOhlcLegendFromLatest()
      } catch {
        if (d.seriesRef.current) {
          d.applySeriesData(d.seriesRef.current, d.chartTypeRef.current, {
            resetView: false,
          })
        }
      }
    }
  }, [])
}

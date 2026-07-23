import OhlcLegend from './OhlcLegend'
import { VOLUME_SMA_COLOR, VOLUME_SMA_LABEL } from '../chart/helpers'

/**
 * Main chart surface: loading overlay, OHLC legend, volume SMA chip, LWC host.
 */
export default function ChartPanel({
  containerRef,
  loading,
  switching,
  adding,
  activeIsPending,
  ohlcLegend,
  onClearDrawings,
  clearDrawingsEnabled = false,
}) {
  const canClearDrawings =
    typeof onClearDrawings === 'function' && Boolean(clearDrawingsEnabled)

  return (
    <div className="chart-panel">
      {(loading || switching || activeIsPending) && (
        <div className="chart-loading">
          {adding
            ? 'Adding & seeding…'
            : activeIsPending
              ? 'Waiting for symbol bootstrap…'
              : switching
                ? 'Loading symbol…'
                : 'Loading candles…'}
        </div>
      )}
      <div className="chart-top-toolbar" aria-label="OHLC and drawings">
        <OhlcLegend candle={ohlcLegend} />
        {typeof onClearDrawings === 'function' && (
          <button
            type="button"
            className="chart-clear-drawings"
            disabled={!canClearDrawings}
            title={
              canClearDrawings
                ? 'Remove pattern drawings (lines & markers) from the chart'
                : 'No drawings on the chart'
            }
            /* LWC captures pointer on the canvas; stop events before they reach the chart. */
            onPointerDown={(e) => {
              e.stopPropagation()
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!canClearDrawings) return
              onClearDrawings()
            }}
          >
            Clear drawings
          </button>
        )}
      </div>
      <div
        className="volume-pane-legend"
        title="Simple moving average of volume over the last 20 bars"
      >
        <span
          className="volume-pane-legend__swatch"
          style={{ background: VOLUME_SMA_COLOR }}
        />
        <span className="volume-pane-legend__text">{VOLUME_SMA_LABEL}</span>
      </div>
      <div ref={containerRef} className="chart-container" />
    </div>
  )
}

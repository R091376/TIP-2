import OhlcLegend from './OhlcLegend'
import PatternInstancePanel from './PatternInstancePanel'
import {
  ATR_COLOR,
  ATR_LABEL,
  VOLUME_SMA_COLOR,
  VOLUME_SMA_LABEL,
} from '../chart/helpers'

/**
 * Main chart surface: loading overlay, OHLC legend, trade actions,
 * ATR/volume toggles + legend chips, pattern inspect panel, LWC host.
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
  tradeSlot = null,
  patternInspect = null,
  showAtr = true,
  showVolume = true,
  onToggleAtr,
  onToggleVolume,
}) {
  const showClearDrawings =
    typeof onClearDrawings === 'function' && Boolean(clearDrawingsEnabled)

  const showInspect =
    patternInspect &&
    (patternInspect.alert ||
      patternInspect.instance ||
      patternInspect.loading ||
      patternInspect.error)

  const panelClass = [
    'chart-panel',
    showAtr ? '' : 'chart-panel--no-atr',
    showVolume ? '' : 'chart-panel--no-volume',
  ]
    .filter(Boolean)
    .join(' ')

  function stopChartPointer(e) {
    e.stopPropagation()
  }

  return (
    <div className={panelClass}>
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
      <div className="chart-top-toolbar" aria-label="Trade, OHLC, and drawings">
        {tradeSlot}
        <OhlcLegend candle={ohlcLegend} />
        <div className="chart-pane-toggles" role="group" aria-label="Indicator panes">
          {typeof onToggleAtr === 'function' && (
            <button
              type="button"
              className={`chart-pane-toggle chart-pane-toggle--atr ${showAtr ? 'chart-pane-toggle--on' : ''}`}
              aria-pressed={showAtr}
              title={showAtr ? 'Hide ATR pane' : 'Show ATR pane'}
              onPointerDown={stopChartPointer}
              onMouseDown={stopChartPointer}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onToggleAtr()
              }}
            >
              ATR
            </button>
          )}
          {typeof onToggleVolume === 'function' && (
            <button
              type="button"
              className={`chart-pane-toggle chart-pane-toggle--vol ${showVolume ? 'chart-pane-toggle--on' : ''}`}
              aria-pressed={showVolume}
              title={showVolume ? 'Hide volume pane' : 'Show volume pane'}
              onPointerDown={stopChartPointer}
              onMouseDown={stopChartPointer}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onToggleVolume()
              }}
            >
              Vol
            </button>
          )}
        </div>
        {showClearDrawings && (
          <button
            type="button"
            className="chart-clear-drawings"
            title="Remove pattern drawings (lines & markers) from the chart"
            /* LWC captures pointer on the canvas; stop events before they reach the chart. */
            onPointerDown={stopChartPointer}
            onMouseDown={stopChartPointer}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onClearDrawings()
            }}
          >
            Clear drawings
          </button>
        )}
      </div>
      {showInspect && (
        <PatternInstancePanel
          alert={patternInspect.alert}
          instance={patternInspect.instance}
          loading={patternInspect.loading}
          error={patternInspect.error}
          onClose={patternInspect.onClose}
        />
      )}
      {showAtr && (
        <div
          className="atr-pane-legend"
          title="Wilder Average True Range (14). Volatility yardstick in price units — same formula patterns use for R."
        >
          <span
            className="atr-pane-legend__swatch"
            style={{ background: ATR_COLOR }}
          />
          <span className="atr-pane-legend__text">{ATR_LABEL}</span>
        </div>
      )}
      {showVolume && (
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
      )}
      <div ref={containerRef} className="chart-container" />
    </div>
  )
}

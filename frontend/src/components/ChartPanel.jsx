import ChartWoodieLegend from './ChartWoodieLegend'
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
 * ATR/volume legend chips, pattern inspect panel, LWC host.
 * Extra-pane toggles live in ChartHeader → Indicators dropdown.
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
  showWoodie = false,
  woodieTodayOnly = true,
  onWoodieTodayOnlyChange,
  onHideWoodie,
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
        {showWoodie ? (
          <ChartWoodieLegend
            todayOnly={woodieTodayOnly}
            onTodayOnlyChange={onWoodieTodayOnlyChange}
            onHide={onHideWoodie}
          />
        ) : null}
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

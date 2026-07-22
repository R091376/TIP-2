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
}) {
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
      <OhlcLegend candle={ohlcLegend} />
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

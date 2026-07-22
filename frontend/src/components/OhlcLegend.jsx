import { formatPrice, formatVolume, isCandleUp } from '../chart/helpers'

/**
 * TradingView-style always-on OHLC + volume strip (top of chart).
 * Shows last bar by default; parent updates on crosshair hover.
 */
export default function OhlcLegend({ candle }) {
  if (!candle) return null

  const up = isCandleUp(candle)
  const tone = up ? 'ohlc-legend--up' : 'ohlc-legend--down'

  return (
    <div className={`ohlc-legend ${tone}`} aria-live="polite">
      <LegendField label="O" value={formatPrice(candle.open)} />
      <LegendField label="H" value={formatPrice(candle.high)} />
      <LegendField label="L" value={formatPrice(candle.low)} />
      <LegendField label="C" value={formatPrice(candle.close)} emphasis />
      <LegendField label="Vol" value={formatVolume(candle.volume)} />
    </div>
  )
}

function LegendField({ label, value, emphasis = false }) {
  return (
    <span className={`ohlc-legend__field${emphasis ? ' ohlc-legend__field--emphasis' : ''}`}>
      <span className="ohlc-legend__label">{label}</span>
      <span className="ohlc-legend__value">{value}</span>
    </span>
  )
}

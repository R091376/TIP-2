export default function ChartTypeToggle({
  chartType,
  onChange,
  disabled = false,
  /** Short labels for tight mobile chrome. */
  compact = false,
}) {
  return (
    <div
      className={`chart-type-toggle${compact ? ' chart-type-toggle--compact' : ''}`}
      role="group"
      aria-label="Chart type"
    >
      <button
        type="button"
        className={chartType === 'candlestick' ? 'active' : ''}
        onClick={() => onChange('candlestick')}
        title="Candlestick"
        disabled={disabled}
      >
        {compact ? 'Candle' : 'Candlestick'}
      </button>
      <button
        type="button"
        className={chartType === 'line' ? 'active' : ''}
        onClick={() => onChange('line')}
        title="Line"
        disabled={disabled}
      >
        Line
      </button>
    </div>
  )
}
export default function ChartTypeToggle({ chartType, onChange, disabled = false }) {
  return (
    <div className="chart-type-toggle" role="group" aria-label="Chart type">
      <button
        type="button"
        className={chartType === 'candlestick' ? 'active' : ''}
        onClick={() => onChange('candlestick')}
        title="Candlestick"
        disabled={disabled}
      >
        Candlestick
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
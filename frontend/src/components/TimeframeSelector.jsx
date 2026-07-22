export default function TimeframeSelector({
  timeframes,
  value,
  onChange,
  disabled,
  orientation = 'horizontal',
}) {
  if (!timeframes?.length) {
    return null
  }

  const vertical = orientation === 'vertical'

  return (
    <div
      className={`timeframe-selector${vertical ? ' timeframe-selector--vertical' : ''}`}
      role="group"
      aria-label="Timeframe"
    >
      {timeframes.map((tf) => (
        <button
          key={tf}
          type="button"
          className={value === tf ? 'active' : ''}
          disabled={disabled}
          onClick={() => onChange(tf)}
        >
          {tf}
        </button>
      ))}
    </div>
  )
}

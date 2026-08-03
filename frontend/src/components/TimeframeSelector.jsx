export default function TimeframeSelector({
  timeframes,
  value,
  onChange,
  disabled,
  orientation = 'horizontal',
  /** Native select — compact mobile chrome (one control instead of 6 chips). */
  variant = 'buttons',
}) {
  if (!timeframes?.length) {
    return null
  }

  if (variant === 'select') {
    return (
      <label className="timeframe-selector timeframe-selector--select">
        <span className="visually-hidden">Timeframe</span>
        <select
          value={value}
          disabled={disabled}
          aria-label="Timeframe"
          onChange={(e) => onChange(e.target.value)}
        >
          {timeframes.map((tf) => (
            <option key={tf} value={tf}>
              {tf}
            </option>
          ))}
        </select>
      </label>
    )
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

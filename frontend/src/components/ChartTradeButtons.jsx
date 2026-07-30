/**
 * Chart Buy / Sell for paper trading (chart toolbar).
 * When disabled, shows a visible reason chip (not only a tooltip).
 */
export default function ChartTradeButtons({
  disabled = false,
  disabledReason = '',
  tradingSymbol = '',
  onBuy,
  onSell,
  compact = false,
}) {
  const tip = disabled && disabledReason ? disabledReason : undefined
  const describedBy = tip ? 'chart-trade-disabled-hint' : undefined

  return (
    <div
      className={`chart-trade-buttons${compact ? ' chart-trade-buttons--compact' : ''}${
        disabled ? ' chart-trade-buttons--disabled' : ''
      }`}
      role="group"
      aria-label="Paper trade"
      tabIndex={-1}
      /* Keep chart canvas from stealing pointer events on the toolbar. */
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {tip ? (
        <span
          id="chart-trade-disabled-hint"
          className="chart-trade-disabled-banner"
          title={tip}
        >
          {tip}
        </span>
      ) : null}
      <button
        type="button"
        id="chart-trade-buy"
        className="chart-trade-btn chart-trade-btn--buy"
        disabled={disabled}
        title={tip}
        aria-describedby={describedBy}
        aria-label={`Paper buy ${tradingSymbol || 'symbol'}`}
        onClick={() => onBuy?.()}
      >
        <span className="chart-trade-btn__label chart-trade-btn__label--full">Buy</span>
        <span className="chart-trade-btn__label chart-trade-btn__label--short" aria-hidden="true">
          B
        </span>
      </button>
      <button
        type="button"
        id="chart-trade-sell"
        className="chart-trade-btn chart-trade-btn--sell"
        disabled={disabled}
        title={tip}
        aria-describedby={describedBy}
        aria-label={`Paper sell ${tradingSymbol || 'symbol'}`}
        onClick={() => onSell?.()}
      >
        <span className="chart-trade-btn__label chart-trade-btn__label--full">Sell</span>
        <span className="chart-trade-btn__label chart-trade-btn__label--short" aria-hidden="true">
          S
        </span>
      </button>
    </div>
  )
}

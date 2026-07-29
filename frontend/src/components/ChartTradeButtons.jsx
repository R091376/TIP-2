/**
 * Chart header Buy / Sell + PAPER badge for paper trading.
 * Tooltips (title / aria-describedby) only when disabled.
 */
export default function ChartTradeButtons({
  disabled = false,
  disabledReason = '',
  tradingSymbol = '',
  onBuy,
  onSell,
}) {
  const tip = disabled && disabledReason ? disabledReason : undefined
  const describedBy = tip ? 'chart-trade-disabled-hint' : undefined

  return (
    <div
      className="chart-trade-buttons"
      role="group"
      aria-label="Paper trade"
      tabIndex={-1}
    >
      {tip ? (
        <span id="chart-trade-disabled-hint" className="visually-hidden">
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
      <span className="chart-trade-paper-badge" aria-hidden="true">
        PAPER
      </span>
    </div>
  )
}

import ChartTypeToggle from './ChartTypeToggle'
import ConnectionStatus from './ConnectionStatus'
import TimeframeSelector from './TimeframeSelector'

/**
 * Chart top bar: symbol title, connection, timeframe, chart type.
 * Account menu lives in the app sidebar only.
 */
export default function ChartHeader({
  displayName,
  connectionStatus,
  timeframes,
  timeframe,
  onTimeframeChange,
  chartType,
  onChartTypeChange,
  controlsDisabled,
}) {
  return (
    <header className="chart-header">
      <div className="chart-header__title">
        <h1>{displayName || 'Loading…'}</h1>
        <ConnectionStatus status={connectionStatus} />
      </div>

      <div className="chart-header__controls" aria-label="Chart controls">
        <TimeframeSelector
          orientation="horizontal"
          timeframes={timeframes}
          value={timeframe}
          onChange={onTimeframeChange}
          disabled={controlsDisabled}
        />
        <ChartTypeToggle
          chartType={chartType}
          onChange={onChartTypeChange}
          disabled={controlsDisabled}
        />
      </div>
    </header>
  )
}

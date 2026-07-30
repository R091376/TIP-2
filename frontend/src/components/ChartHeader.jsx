import ChartTypeToggle from './ChartTypeToggle'
import ConnectionStatus from './ConnectionStatus'
import TimeframeSelector from './TimeframeSelector'
import UserAccountMenu from './UserAccountMenu'
import '../styles/userAccount.css'

/**
 * Chart top bar: symbol title, connection, timeframe, chart type, user menu.
 * Cross-page nav lives in the app sidebar.
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
  user,
  onLogout,
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

      <div className="chart-header__user">
        <UserAccountMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  )
}

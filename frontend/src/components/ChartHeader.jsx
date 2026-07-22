import { Link } from 'react-router-dom'
import ChartTypeToggle from './ChartTypeToggle'
import ConnectionStatus from './ConnectionStatus'
import TimeframeSelector from './TimeframeSelector'
import UserAccountMenu from './UserAccountMenu'
import '../styles/userAccount.css'

/**
 * Chart top bar: symbol title, connection, timeframe, chart type, user menu.
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
  isAdmin,
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
        <Link to="/patterns/stats" className="chart-header__nav-link">
          Stats
        </Link>
        {isAdmin && (
          <Link to="/admin/users" className="chart-header__admin-link">
            Admin
          </Link>
        )}
        <UserAccountMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  )
}

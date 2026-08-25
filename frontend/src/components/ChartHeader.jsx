import ChartIndicatorsMenu from './ChartIndicatorsMenu'
import ChartTypeToggle from './ChartTypeToggle'
import ConnectionStatus from './ConnectionStatus'
import TimeframeSelector from './TimeframeSelector'

function IconChart({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 19h16v-2H4v2zm2-4h2V9H6v6zm4 0h2V5h-2v10zm4 0h2v-7h-2v7zm4 0h2V7h-2v8z"
      />
    </svg>
  )
}

function IconBell({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22zm6.4-6.2V11a6.4 6.4 0 0 0-5.1-6.3V4a1.3 1.3 0 1 0-2.6 0v.7A6.4 6.4 0 0 0 5.6 11v4.8L4 17.4V18h16v-.6l-1.6-1.6z"
      />
    </svg>
  )
}

function IconList({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 6h2v2H4V6zm0 5h2v2H4v-2zm0 5h2v2H4v-2zm4-10h12v2H8V6zm0 5h12v2H8v-2zm0 5h12v2H8v-2z"
      />
    </svg>
  )
}

/**
 * Chart top bar: symbol, connection, timeframe, chart type.
 * Phone: single compact row — symbol · TF select · type · icon panels
 * (no bulky Chart/Alerts/Symbols text segment).
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
  mobilePanel,
  onMobilePanelChange,
  alertsCount = 0,
  showAtr,
  showVolume,
  showWoodie,
  onToggleAtr,
  onToggleVolume,
  onToggleWoodie,
  woodieTodayOnly,
  onWoodieTodayOnlyChange,
}) {
  const showMobilePanels = typeof onMobilePanelChange === 'function'

  return (
    <header className="chart-header">
      <div className="chart-header__title">
        <h1>{displayName || 'Loading…'}</h1>
        <ConnectionStatus status={connectionStatus} />
      </div>

      {/* Desktop / tablet: full chip controls */}
      <div className="chart-header__controls chart-header__controls--desktop" aria-label="Chart controls">
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
        <ChartIndicatorsMenu
          showAtr={showAtr}
          showVolume={showVolume}
          showWoodie={showWoodie}
          onToggleAtr={onToggleAtr}
          onToggleVolume={onToggleVolume}
          onToggleWoodie={onToggleWoodie}
          woodieTodayOnly={woodieTodayOnly}
          onWoodieTodayOnlyChange={onWoodieTodayOnlyChange}
          disabled={controlsDisabled}
        />
      </div>

      {/* Phone: one toolbar — TF dropdown + type + icon panel switch */}
      <div className="chart-header__mobile-tools">
        <TimeframeSelector
          variant="select"
          timeframes={timeframes}
          value={timeframe}
          onChange={onTimeframeChange}
          disabled={controlsDisabled}
        />
        <ChartTypeToggle
          compact
          chartType={chartType}
          onChange={onChartTypeChange}
          disabled={controlsDisabled}
        />
        <ChartIndicatorsMenu
          compact
          showAtr={showAtr}
          showVolume={showVolume}
          showWoodie={showWoodie}
          onToggleAtr={onToggleAtr}
          onToggleVolume={onToggleVolume}
          onToggleWoodie={onToggleWoodie}
          woodieTodayOnly={woodieTodayOnly}
          onWoodieTodayOnlyChange={onWoodieTodayOnlyChange}
          disabled={controlsDisabled}
        />
        {showMobilePanels ? (
          <nav className="chart-mobile-icons" aria-label="Chart panels">
            <button
              type="button"
              className={`chart-mobile-icons__btn${mobilePanel === 'chart' ? ' is-active' : ''}`}
              aria-label="Chart"
              aria-pressed={mobilePanel === 'chart'}
              title="Chart"
              onClick={() => onMobilePanelChange('chart')}
            >
              <IconChart />
            </button>
            <button
              type="button"
              className={`chart-mobile-icons__btn${mobilePanel === 'alerts' ? ' is-active' : ''}`}
              aria-label={alertsCount > 0 ? `Alerts, ${alertsCount}` : 'Alerts'}
              aria-pressed={mobilePanel === 'alerts'}
              title="Alerts"
              onClick={() => onMobilePanelChange('alerts')}
            >
              <IconBell />
              {alertsCount > 0 ? (
                <span className="chart-mobile-icons__badge">
                  {alertsCount > 99 ? '99+' : alertsCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className={`chart-mobile-icons__btn${mobilePanel === 'watchlist' ? ' is-active' : ''}`}
              aria-label="Symbols"
              aria-pressed={mobilePanel === 'watchlist'}
              title="Symbols"
              onClick={() => onMobilePanelChange('watchlist')}
            >
              <IconList />
            </button>
          </nav>
        ) : null}
      </div>
    </header>
  )
}

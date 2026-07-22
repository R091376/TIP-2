const STATUS_LABELS = {
  connecting: 'Connecting…',
  connected: 'Live',
  disconnected: 'Disconnected',
  error: 'Connection error',
  market_closed: 'Market closed',
  pre_open: 'Pre-open',
}

export default function ConnectionStatus({ status }) {
  const label = STATUS_LABELS[status] ?? status

  return (
    <span className={`connection-status connection-status--${status}`}>
      <span className="connection-status__dot" aria-hidden="true" />
      {label}
    </span>
  )
}
import { useMemo, useState } from 'react'
import {
  computeInstanceMetrics,
  formatMetricPrice,
  formatMetricR,
  patternConfigKnobs,
} from '../utils/patternInstanceMetrics'
import { stageShortLabel } from '../utils/patternOverlay'
import './patternInstancePanel.css'

function flagList(inst) {
  const bits = []
  if (inst?.flagConfirmed) bits.push('Confirmed')
  if (inst?.flagRetested) bits.push('Retested')
  if (inst?.flagReclaimed) bits.push('Reclaimed')
  if (inst?.flagStrengthened) bits.push('Strengthened')
  if (inst?.terminal) bits.push('Terminal')
  return bits
}

function defaultExpanded() {
  if (typeof window === 'undefined') return true
  try {
    return !window.matchMedia('(max-width: 768px)').matches
  } catch {
    return true
  }
}

/**
 * Inspect card for a focused pattern instance (rails, ATR, R-metrics, detector knobs).
 * Desktop: expanded by default. Mobile: compact chip until user expands (less chart clutter).
 */
export default function PatternInstancePanel({
  alert,
  instance,
  loading = false,
  error = null,
  onClose,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const metrics = computeInstanceMetrics(instance)
  const knobs = patternConfigKnobs(instance?.patternType || alert?.patternType)
  const titleType = (instance?.patternType || alert?.patternType || 'pattern').replace(
    /_/g,
    ' ',
  )
  const stage = instance?.stage || instance?.status || alert?.stage
  const flags = flagList(instance)

  const summaryLine = useMemo(() => {
    const parts = []
    if (metrics.atr != null) parts.push(`ATR ${formatMetricPrice(metrics.atr)}`)
    if (metrics.entry != null) parts.push(`E ${formatMetricPrice(metrics.entry)}`)
    if (metrics.stop != null) parts.push(`S ${formatMetricPrice(metrics.stop)}`)
    if (metrics.target != null) parts.push(`T ${formatMetricPrice(metrics.target)}`)
    return parts.length ? parts.join(' · ') : null
  }, [metrics.atr, metrics.entry, metrics.stop, metrics.target])

  if (!alert && !instance && !loading && !error) return null

  return (
    <aside
      className={`pattern-inspect ${expanded ? 'pattern-inspect--expanded' : 'pattern-inspect--compact'}`}
      aria-label="Pattern instance details"
    >
      <header className="pattern-inspect__head">
        <button
          type="button"
          className="pattern-inspect__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? 'Collapse details' : 'Expand details'}
        >
          <div className="pattern-inspect__title">
            <strong>
              {expanded ? '▾' : '▸'} {titleType}
            </strong>
            <span className="pattern-inspect__meta">
              {(instance?.direction || alert?.direction || '—').toString()}
              {' · '}
              {instance?.timeframe || alert?.timeframe || '—'}
              {stage ? ` · ${stageShortLabel(stage)}` : ''}
            </span>
            {!expanded && summaryLine && (
              <span className="pattern-inspect__summary mono">{summaryLine}</span>
            )}
          </div>
        </button>
        {typeof onClose === 'function' && (
          <button
            type="button"
            className="pattern-inspect__close"
            aria-label="Close pattern details"
            onClick={onClose}
          >
            ×
          </button>
        )}
      </header>

      {loading && (
        <p className="pattern-inspect__status">Loading rails (entry / stop / target / ATR)…</p>
      )}
      {error && !loading && (
        <p className="pattern-inspect__status pattern-inspect__status--err">{error}</p>
      )}

      {expanded && !loading && instance && (
        <>
          <section className="pattern-inspect__section">
            <h3 className="pattern-inspect__h">Rails (frozen at detect)</h3>
            <dl className="pattern-inspect__grid">
              <div>
                <dt>ATR @ detect</dt>
                <dd className="pattern-inspect__mono">{formatMetricPrice(metrics.atr)}</dd>
              </div>
              <div>
                <dt>Entry</dt>
                <dd className="pattern-inspect__mono">{formatMetricPrice(metrics.entry)}</dd>
              </div>
              <div>
                <dt>Stop</dt>
                <dd className="pattern-inspect__mono pattern-inspect__stop">
                  {formatMetricPrice(metrics.stop)}
                </dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd className="pattern-inspect__mono pattern-inspect__target">
                  {formatMetricPrice(metrics.target)}
                </dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd className="pattern-inspect__mono">{formatMetricPrice(metrics.reference)}</dd>
              </div>
              {instance.retestFloor != null && (
                <div>
                  <dt>Retest floor</dt>
                  <dd className="pattern-inspect__mono">{formatMetricPrice(instance.retestFloor)}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="pattern-inspect__section">
            <h3 className="pattern-inspect__h">Distances (R = ATR @ detect)</h3>
            <dl className="pattern-inspect__grid">
              <div>
                <dt>Risk (entry→stop)</dt>
                <dd className="pattern-inspect__mono">{formatMetricR(metrics.riskR)}</dd>
              </div>
              <div>
                <dt>Reward (entry→target)</dt>
                <dd className="pattern-inspect__mono">{formatMetricR(metrics.rewardR)}</dd>
              </div>
              <div>
                <dt>Reward / risk</dt>
                <dd className="pattern-inspect__mono">
                  {metrics.rewardRisk != null ? `${metrics.rewardRisk.toFixed(2)}×` : '—'}
                </dd>
              </div>
              <div>
                <dt>MFE</dt>
                <dd className="pattern-inspect__mono">{formatMetricR(metrics.mfeR)}</dd>
              </div>
              <div>
                <dt>MAE</dt>
                <dd className="pattern-inspect__mono">{formatMetricR(metrics.maeR)}</dd>
              </div>
              <div>
                <dt>Move (terminal)</dt>
                <dd className="pattern-inspect__mono">{formatMetricR(metrics.moveR)}</dd>
              </div>
            </dl>
          </section>

          <section className="pattern-inspect__section">
            <h3 className="pattern-inspect__h">Lifecycle</h3>
            <dl className="pattern-inspect__grid">
              <div>
                <dt>Duration</dt>
                <dd className="pattern-inspect__mono">
                  {instance.durationCandles != null ? `${instance.durationCandles} bars` : '—'}
                </dd>
              </div>
              <div>
                <dt>Outcome</dt>
                <dd className="pattern-inspect__mono">
                  {instance.finalOutcome || (instance.active ? 'open' : '—')}
                </dd>
              </div>
              <div>
                <dt>End price</dt>
                <dd className="pattern-inspect__mono">{formatMetricPrice(instance.endPrice)}</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd className="pattern-inspect__reason">{instance.terminalReason || '—'}</dd>
              </div>
              {flags.length > 0 && (
                <div className="pattern-inspect__flags-row">
                  <dt>Flags</dt>
                  <dd>
                    <span className="pattern-inspect__flags">
                      {flags.map((f) => (
                        <span key={f} className="pattern-inspect__flag">
                          {f}
                        </span>
                      ))}
                    </span>
                  </dd>
                </div>
              )}
              {instance.detectorVersion && (
                <div>
                  <dt>Version</dt>
                  <dd className="pattern-inspect__mono">{instance.detectorVersion}</dd>
                </div>
              )}
            </dl>
          </section>

          {knobs.length > 0 && (
            <section className="pattern-inspect__section">
              <h3 className="pattern-inspect__h">
                Detector defaults
                <span className="pattern-inspect__hint"> (TIP config, not per-trade freeze)</span>
              </h3>
              <dl className="pattern-inspect__grid pattern-inspect__grid--knobs">
                {knobs.map((k) => (
                  <div key={k.key}>
                    <dt title={k.key}>{k.label}</dt>
                    <dd className="pattern-inspect__mono">{k.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {instance && !instance.terminal && (
            <p className="pattern-inspect__status">
              Open setup — rails frozen at detect. MFE / MAE / terminal move update as the
              instance evolves.
            </p>
          )}
        </>
      )}

      {expanded && !loading && !instance && !error && alert && (
        <p className="pattern-inspect__status">
          Stage event selected ({stageShortLabel(alert.stage) || 'EVT'}). Loading entry / stop /
          target / ATR…
        </p>
      )}

      {alert?.price != null && (
        <footer className="pattern-inspect__foot">
          Focus @ {formatMetricPrice(alert.price)}
          {alert.stage ? ` · ${stageShortLabel(alert.stage)}` : ''}
          {instance?.active || (!instance?.terminal && alert?.stage === 'detected')
            ? ' · open'
            : ''}
        </footer>
      )}
    </aside>
  )
}

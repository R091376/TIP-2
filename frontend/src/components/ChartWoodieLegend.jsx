import { useEffect, useId, useRef, useState } from 'react'

function IconGear({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.16a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.7.22l2.39-.96c.5.39 1.04.7 1.63.94l.36 2.54c.05.24.26.42.49.42h3.8c.23 0 .44-.18.49-.42l.36-2.54c.59-.24 1.13-.55 1.63-.94l2.39.96c.27.12.56.02.7-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
      />
    </svg>
  )
}

/**
 * TradingView-style overlay ident + settings on the price pane.
 */
export default function ChartWoodieLegend({
  todayOnly = true,
  onTodayOnlyChange,
  onHide,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function onDocPointer(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDocPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function stopChartPointer(e) {
    e.stopPropagation()
  }

  return (
    <div
      className={`chart-woodie-legend${open ? ' is-open' : ''}`}
      ref={rootRef}
      onPointerDown={stopChartPointer}
      onMouseDown={stopChartPointer}
    >
      <span className="chart-woodie-legend__swatch" aria-hidden="true" />
      <span className="chart-woodie-legend__name">Woodie S/R</span>
      <span className="chart-woodie-legend__mode">{todayOnly ? 'Today' : 'All days'}</span>
      <button
        type="button"
        className="chart-woodie-legend__gear"
        aria-label="Woodie S/R settings"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        title="Woodie S/R settings"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <IconGear />
      </button>
      {typeof onHide === 'function' ? (
        <button
          type="button"
          className="chart-woodie-legend__hide"
          aria-label="Hide Woodie S/R"
          title="Hide"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onHide()
          }}
        >
          ×
        </button>
      ) : null}
      {open ? (
        <div id={menuId} className="chart-woodie-legend__panel" role="menu" aria-label="Woodie S/R settings">
          <label className="chart-woodie-legend__row" role="menuitemcheckbox" aria-checked={todayOnly}>
            <input
              type="checkbox"
              checked={todayOnly}
              onChange={(e) => onTodayOnlyChange?.(e.target.checked)}
            />
            <span>
              <span className="chart-woodie-legend__row-title">Today only</span>
              <span className="chart-woodie-legend__row-hint">
                Draw this IST session’s ladder. Uncheck to show every day.
              </span>
            </span>
          </label>
        </div>
      ) : null}
    </div>
  )
}

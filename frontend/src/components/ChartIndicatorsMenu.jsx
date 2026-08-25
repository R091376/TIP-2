import { useEffect, useId, useRef, useState } from 'react'

export function indicatorMenuItems({
  showAtr,
  showVolume,
  showWoodie,
  woodieAvailable,
}) {
  const items = [
    {
      id: 'atr',
      label: 'ATR (14)',
      hint: 'Separate volatility pane',
      checked: !!showAtr,
    },
    {
      id: 'volume',
      label: 'Volume SMA (20)',
      hint: 'Separate volume pane',
      checked: !!showVolume,
    },
  ]
  if (woodieAvailable) {
    items.push({
      id: 'woodie',
      label: 'Woodie S/R',
      hint: 'Each IST session’s frozen S/R on that day’s bars',
      checked: !!showWoodie,
    })
  }
  return items
}

/**
 * Header dropdown to show/hide extra panes and overlays (ATR, volume SMA, Woodie).
 */
export default function ChartIndicatorsMenu({
  showAtr,
  showVolume,
  showWoodie,
  onToggleAtr,
  onToggleVolume,
  onToggleWoodie,
  woodieTodayOnly = true,
  onWoodieTodayOnlyChange,
  disabled = false,
  compact = false,
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const menuId = useId()
  const woodieAvailable = typeof onToggleWoodie === 'function'
  const items = indicatorMenuItems({
    showAtr,
    showVolume,
    showWoodie,
    woodieAvailable,
  })
  const onCount = items.filter((it) => it.checked).length

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

  function toggle(id) {
    if (id === 'atr') onToggleAtr?.()
    else if (id === 'volume') onToggleVolume?.()
    else if (id === 'woodie') onToggleWoodie?.()
  }

  if (!onToggleAtr && !onToggleVolume && !woodieAvailable) return null

  return (
    <div
      className={`chart-ind-menu${compact ? ' chart-ind-menu--compact' : ''}${open ? ' is-open' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="chart-ind-menu__btn"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        title="Show or hide extra charts"
        onClick={() => setOpen((v) => !v)}
      >
        {compact ? 'Ind' : 'Indicators'}
        {onCount > 0 ? (
          <span className="chart-ind-menu__count" aria-hidden="true">
            {onCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={menuId}
          className="chart-ind-menu__panel"
          role="menu"
          aria-label="Extra charts"
        >
          {items.map((it) => (
            <label key={it.id} className="chart-ind-menu__row" role="menuitemcheckbox" aria-checked={it.checked}>
              <input
                type="checkbox"
                checked={it.checked}
                disabled={disabled}
                onChange={() => toggle(it.id)}
              />
              <span className="chart-ind-menu__copy">
                <span className="chart-ind-menu__label">{it.label}</span>
                <span className="chart-ind-menu__hint">{it.hint}</span>
              </span>
            </label>
          ))}
          {woodieAvailable && showWoodie && typeof onWoodieTodayOnlyChange === 'function' ? (
            <label
              className="chart-ind-menu__row chart-ind-menu__row--nested"
              role="menuitemcheckbox"
              aria-checked={woodieTodayOnly}
            >
              <input
                type="checkbox"
                checked={woodieTodayOnly}
                disabled={disabled}
                onChange={(e) => onWoodieTodayOnlyChange(e.target.checked)}
              />
              <span className="chart-ind-menu__copy">
                <span className="chart-ind-menu__label">Today only</span>
                <span className="chart-ind-menu__hint">
                  Current IST session. Uncheck for all days.
                </span>
              </span>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { searchInstruments } from '../services/instrumentsApi'

const MIN_QUERY = 2
const DEBOUNCE_MS = 250
const DEFAULT_LIMIT = 15

/**
 * Combobox: typeahead over instrument master, pick to add (or free-text Enter).
 *
 * @param {(payload: { symbol?: string, instrumentKey?: string }) => Promise<void>|void} onAdd
 * @param {Set<string>|string[]} watchlistKeys instrument keys already on list
 * @param {number} [hardMax=50]
 * @param {number} [watchlistSize=0]
 */
export default function InstrumentSearch({
  onAdd,
  watchlistKeys,
  hardMax = 50,
  watchlistSize = 0,
  disabled,
  adding,
  /** Stack label above field (sidebar layout) */
  compact = false,
}) {
  const listboxId = useId()
  const inputRef = useRef(null)
  const panelRef = useRef(null)
  const seqRef = useRef(0)
  const abortRef = useRef(null)

  const [draft, setDraft] = useState('')
  const [hits, setHits] = useState([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  /** Open suggestions above the field when near the bottom of the viewport */
  const [openUp, setOpenUp] = useState(false)

  const onList = useCallback(
    (instrumentKey) => {
      if (!watchlistKeys) return false
      if (watchlistKeys instanceof Set) return watchlistKeys.has(instrumentKey)
      return watchlistKeys.includes(instrumentKey)
    },
    [watchlistKeys],
  )

  const full = watchlistSize >= hardMax
  const inputDisabled = disabled || adding || full

  const query = (draft || '').trim()
  const showPanel =
    open &&
    query.length >= MIN_QUERY &&
    (hits.length > 0 || searching || !!searchError)

  // Debounced search
  useEffect(() => {
    const q = (draft || '').trim()
    if (q.length < MIN_QUERY) {
      setHits([])
      setSearching(false)
      setSearchError(null)
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      return
    }

    const seq = ++seqRef.current
    const handle = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setSearching(true)
      setSearchError(null)
      try {
        const results = await searchInstruments(q, DEFAULT_LIMIT, ac.signal)
        if (seq !== seqRef.current) return
        setHits(Array.isArray(results) ? results : [])
        setOpen(true)
        setHighlight(-1)
      } catch (err) {
        if (err?.name === 'AbortError') return
        if (seq !== seqRef.current) return
        setHits([])
        setSearchError(err instanceof Error ? err.message : 'Search failed')
        setOpen(true)
      } finally {
        if (seq === seqRef.current) setSearching(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(handle)
  }, [draft])

  // Close panel on outside click
  useEffect(() => {
    function onDoc(e) {
      if (!open) return
      const t = e.target
      if (panelRef.current?.contains(t) || inputRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Prefer opening upward if not enough room below (keeps list on-screen)
  useEffect(() => {
    if (!showPanel) {
      setOpenUp(false)
      return
    }
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const spaceAbove = rect.top
    const needed = Math.min(window.innerHeight * 0.45, 14 * 16) // match CSS max-height
    setOpenUp(spaceBelow < needed + 24 && spaceAbove > spaceBelow)
  }, [showPanel, hits.length])

  async function submitAdd(payload) {
    if (inputDisabled || !payload) return
    try {
      await onAdd(payload)
      setDraft('')
      setHits([])
      setOpen(false)
      setHighlight(-1)
    } catch {
      // parent surfaces error
    }
  }

  function pickHit(hit) {
    if (!hit || onList(hit.instrumentKey)) return
    return submitAdd({
      instrumentKey: hit.instrumentKey,
      symbol: hit.tradingSymbol,
    })
  }

  function freeTextAdd() {
    const symbol = (draft || '').trim()
    if (!symbol) return
    // If a highlighted enabled hit exists, prefer it
    if (highlight >= 0 && highlight < hits.length) {
      const hit = hits[highlight]
      if (hit && !onList(hit.instrumentKey)) {
        return pickHit(hit)
      }
    }
    // Exact trading-symbol match in hits
    const exact = hits.find(
      (h) =>
        h.tradingSymbol?.toUpperCase() === symbol.toUpperCase() &&
        !onList(h.instrumentKey),
    )
    if (exact) return pickHit(exact)
    return submitAdd({ symbol })
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false)
      setHighlight(-1)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open && hits.length) setOpen(true)
      setHighlight((h) => {
        const next = h + 1
        return next >= hits.length ? 0 : next
      })
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => {
        if (hits.length === 0) return -1
        const next = h - 1
        return next < 0 ? hits.length - 1 : next
      })
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      freeTextAdd()
    }
  }

  return (
    <div
      className={'instrument-search' + (compact ? ' instrument-search--compact' : '')}
      ref={panelRef}
    >
      {!compact && (
        <label className="instrument-search__label" htmlFor="instrument-search-input">
          Add
        </label>
      )}
      <div className="instrument-search__field">
        <input
          id="instrument-search-input"
          ref={inputRef}
          type="text"
          className="instrument-search__input"
          placeholder={full ? 'Watchlist full (50)' : 'Search stock or index…'}
          value={draft}
          disabled={inputDisabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label="Search stock or index to add"
          aria-activedescendant={
            highlight >= 0 && hits[highlight]
              ? `${listboxId}-opt-${highlight}`
              : undefined
          }
          onChange={(e) => {
            setDraft(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            if ((draft || '').trim().length >= MIN_QUERY) setOpen(true)
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="instrument-search__btn"
          disabled={inputDisabled || !(draft || '').trim()}
          onClick={freeTextAdd}
        >
          {adding ? '…' : 'Add'}
        </button>

        {showPanel && (
          <ul
            id={listboxId}
            className={
              'instrument-search__panel' +
              (openUp ? ' instrument-search__panel--up' : '')
            }
            role="listbox"
            aria-label="Instrument suggestions"
          >
            {searching && hits.length === 0 && (
              <li className="instrument-search__hint" role="presentation">
                Searching…
              </li>
            )}
            {searchError && (
              <li className="instrument-search__hint instrument-search__hint--error" role="presentation">
                {searchError}
              </li>
            )}
            {!searching && !searchError && hits.length === 0 && (
              <li className="instrument-search__hint" role="presentation">
                No matches
              </li>
            )}
            {hits.map((hit, i) => {
              const listed = onList(hit.instrumentKey)
              const active = i === highlight
              return (
                <li
                  key={hit.instrumentKey}
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={active}
                  aria-disabled={listed}
                  className={
                    'instrument-search__option' +
                    (active ? ' instrument-search__option--active' : '') +
                    (listed ? ' instrument-search__option--listed' : '')
                  }
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    // prevent input blur before click
                    e.preventDefault()
                  }}
                  onClick={() => {
                    if (!listed) pickHit(hit)
                  }}
                >
                  <span className="instrument-search__option-main">
                    <span className="instrument-search__ts">{hit.tradingSymbol}</span>
                    {hit.displayName && hit.displayName !== hit.tradingSymbol && (
                      <span className="instrument-search__dn">{hit.displayName}</span>
                    )}
                  </span>
                  <span className="instrument-search__meta">
                    {listed ? 'On list' : hit.instrumentType || hit.segment}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

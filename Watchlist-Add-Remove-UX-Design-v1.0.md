# Watchlist Add / Remove UX Design v1.0

**Status:** Proposed  
**Date:** 2026-07-10  
**Depends on:** Multi-Symbol Watchlist Design v1.0 (in-memory watchlist, `InstrumentMasterCache`, thin `SymbolSwitcher`)  
**Scope:** Frontend watchlist interaction + small backend instrument **search** API. Add/remove lifecycle semantics stay as today.

---

## 1. Problem

Today’s UI (`SymbolSwitcher`) is:

| Action | Current UX | Pain |
|--------|------------|------|
| **Select chart symbol** | Native `<select>` of watchlist only | OK for switching, but mixed with add/remove |
| **Add** | Free-text input → exact trading symbol string | User must know ticker (`RELIANCE`, not “Reliance”); typos → 404; no browse of master |
| **Remove** | Single **Remove** button = **active** symbol only | Cannot delete a non-active stock without first switching to it |

Desired:

1. **Add:** type a few characters → **dropdown of matching instruments** from the master list → pick one → add & seed.  
2. **Remove:** each watchlist stock shows a **delete control** next to it (not only “remove active”).

---

## 2. Goals / non-goals

### Goals

- Autocomplete / typeahead over **NSE EQ + NSE INDEX** already indexed in `InstrumentMasterCache` (~2.8k keys today).
- Explicit pick from suggestions before POST (reduces bad adds).
- Per-row delete on the watchlist list (any symbol, not only active).
- Keep existing backend lifecycle: blocking POST seed, DELETE hard-remove, capacity 50, bootstrap statuses.
- Fit dark chart header chrome; keyboard-friendly (type, arrows, Enter, Esc).

### Non-goals (this feature)

- Full-screen instrument browser / pagination of entire master.
- F&O / MCX / BSE (master still NSE EQ + INDEX only).
- Drag-reorder watchlist, multi-select delete, confirm modal mandatory (optional soft confirm only if product later wants it).
- Postgres persistence (still in-memory).
- Changing candle seed lookbacks or memory caps.

---

## 3. UX design

### 3.1 Layout (header)

Replace the cramped “select + free text + Remove” strip with two clear zones:

```
┌─ Chart header ─────────────────────────────────────────────────────────┐
│  NIFTY · 5m   [Live]                                                   │
│                                                                        │
│  Watchlist chips / rows:                                               │
│  [ NIFTY ✓ ] [ RELIANCE × ] [ TCS × ] …   ← click label = select chart │
│                                      × = remove that symbol            │
│                                                                        │
│  Add:  [ 🔍 Type symbol or name…        ▼ ]  (combobox + suggestions)  │
│        TF selector · Chart type                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Primary recommendation:** **chip/pill list** (not native multi-select):

- Each chip: **label** (`tradingSymbol` or short `displayName`) + optional tiny status badge (PENDING/FAILED).
- **Click chip body** → set active chart symbol (same as today’s select).
- **Click ×** on chip → remove **that** `symbolId` (does not require it to be active).
- Active chip: stronger border/background so current chart symbol is obvious.
- Horizontal wrap under title on narrow widths.

Alternative (acceptable if chips feel tight): **left list panel** later; v1 stays header chips to avoid layout rewrite.

### 3.2 Add combobox

| Behavior | Spec |
|----------|------|
| Control | Single text field with dropdown panel (combobox pattern) |
| Placeholder | `Search stock or index…` |
| Min query length | **2** characters before search (avoid dumping 2.6k rows) |
| Debounce | **200–300 ms** after last keystroke |
| Max suggestions | **15** (default; configurable) |
| Match | Case-insensitive **prefix or contains** on `tradingSymbol`, `displayName`, and for indexes also common names (e.g. `Nifty 50`) |
| Ranking | Exact trading-symbol match → prefix match on trading symbol → contains on display name → rest |
| Already on watchlist | Show row **disabled** / greyed with tag `On list` (or hide — **prefer show disabled** so user understands why it won’t re-add) |
| At hard max (50) | Disable input; tooltip “Watchlist full (50)” |
| Select suggestion | Fill field with chosen symbol; **optional auto-submit** on Enter/click — **recommended: click/Enter immediately POSTs** (one less click) |
| Free-text fallback | If user hits Add/Enter with no highlighted row but exact resolve would work: still POST trading symbol string (compat). Prefer instrumentKey when suggestion selected. |
| Loading add | Disable combobox; show “Adding & seeding…” (existing banner) |
| Empty results | “No matches” in panel |
| Master not ready | 503/empty → “Instrument list loading…” |

### 3.3 Remove

| Behavior | Spec |
|----------|------|
| Control | `×` / trash icon on **each** chip |
| Target | That chip’s `symbolId` (instrument key) |
| Confirm | **None** in v1 (fast trading UI). Optional later: confirm only when removing last symbol. |
| Active removed | Same as today: switch to first READY remaining, or empty-state message |
| Non-active removed | Stay on current chart; refresh chip list only |
| Pending seed | Allow remove (backend already cooperative-cancel / REMOVING) |
| Last symbol | Allowed; chart empty state + prompt to add |

### 3.4 Accessibility

- Combobox: `role="combobox"`, listbox `role="listbox"`, options `role="option"`, `aria-activedescendant`.
- Arrow Up/Down moves highlight; Enter selects; Esc closes.
- Chip delete: `aria-label="Remove RELIANCE from watchlist"`.
- Don’t rely on color alone for PENDING/FAILED (text or icon).

---

## 4. Backend

### 4.1 Existing APIs (unchanged semantics)

| Method | Path | Role |
|--------|------|------|
| GET | `/api/watchlist` | List chips |
| POST | `/api/watchlist` body `{ "symbol": "RELIANCE" }` | Blocking add by trading symbol |
| DELETE | `/api/watchlist/{symbolId}` | Hard remove |

Optional small enhancement (nice-to-have, same PR or follow-up):

```json
POST /api/watchlist
{ "symbol": "RELIANCE" }
// OR
{ "instrumentKey": "NSE_EQ|INE002A01018" }
```

When `instrumentKey` is present, skip fuzzy resolve and use master by key (authoritative after autocomplete). Keep `symbol` for backward compatibility.

### 4.2 New: instrument search (required for autocomplete)

**Endpoint**

```http
GET /api/instruments/search?q=rel&limit=15
```

**Response 200**

```json
[
  {
    "instrumentKey": "NSE_EQ|INE002A01018",
    "tradingSymbol": "RELIANCE",
    "displayName": "Reliance",
    "exchange": "NSE",
    "segment": "NSE_EQ",
    "instrumentType": "EQ"
  }
]
```

**Rules**

| Rule | Detail |
|------|--------|
| Source | In-memory `InstrumentMasterCache` only (no Upstox call per keystroke) |
| Segments | Same as resolve: **NSE_EQ** (EQ preferred over BE) + **NSE_INDEX** |
| `q` blank / &lt; 2 | Return `[]` (or 400 — prefer `[]` for simpler FE) |
| `limit` | Default 15, max 50 |
| Performance | Linear scan over ~3k is fine (&lt;1 ms). Optional later: prefix trie. |
| Master empty / failed load | `[]` or 503 with message; FE shows soft error |

**Implementation sketch**

```java
// InstrumentMasterCache
public List<ResolvedInstrument> search(String query, int limit) {
    // ensureLoaded(); normalize query;
    // stream eq + index maps' values (dedupe by instrumentKey);
    // score & sort; return top limit
}
```

New controller e.g. `InstrumentController` under `/api/instruments`.

### 4.3 What we do **not** change

- Seed lookbacks, candle engine, live feed subscribe/unsubscribe.
- Hard max 50 / soft warn 40.
- Bootstrap READY / PENDING / FAILED matrix.

---

## 5. Frontend structure

### 5.1 Components

| Component | Responsibility |
|-----------|----------------|
| `WatchlistBar` (new) | Renders chips: select + per-chip remove |
| `InstrumentSearch` (new) | Combobox, debounce, calls search API, emits selected instrument |
| `SymbolSwitcher` | **Refactor/slim**: compose `WatchlistBar` + `InstrumentSearch`, or replace entirely |
| `ChartContainer` | Keep `handleAdd` / `handleRemove`; wire new callbacks (`onRemove(symbolId)` already exists; chip list uses same) |

### 5.2 Services

```js
// instrumentsApi.js
export async function searchInstruments(q, limit = 15) {
  const response = await fetch(
    `/api/instruments/search?q=${encodeURIComponent(q)}&limit=${limit}`
  )
  return handleResponse(response)
}

// watchlistApi.js — extend add if instrumentKey supported
export async function addSymbol(symbolOrKey) {
  // body: { symbol } or { instrumentKey }
}
```

### 5.3 State / race notes

- Debounced search: ignore stale responses (sequence id / AbortController).
- During `adding`, disable search + chip deletes optional (prefer **allow remove** of other symbols while one is seeding; disable only double-add).
- After add success: clear search box, refresh watchlist, auto-switch to new symbol (current behavior).

---

## 6. Key decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| **UX-1** | Chips with in-chip × for remove; click label selects chart | Matches “delete next to stock”; no switch-then-remove |
| **UX-2** | Server-side search API, not dump full master to browser | Smaller FE, one cache source of truth, easy filter rules |
| **UX-3** | Min 2 chars, limit 15, debounce ~250 ms | Avoid noise and useless full scans in UI |
| **UX-4** | Show already-listed matches as disabled | Better teachability than silent omission |
| **UX-5** | No confirm dialog on remove (v1) | Speed; empty list already handled |
| **UX-6** | Prefer POST with `instrumentKey` when user picks a row | Avoid ambiguous trading-symbol collisions later |
| **UX-7** | Keep free-text exact POST as fallback | Power users + backward compat with current API clients |

---

## 7. Wireframes (text)

### Idle (10 symbols)

```
[ NIFTY* ] [ RELIANCE × ] [ TCS × ] [ HDFCBANK × ] …
* = active (no × disabled? → still allow × on active)

Search: [ rel______________ ]
         ┌─────────────────────────────┐
         │ RELIANCE · Reliance    EQ   │
         │ RELIANCEP …                 │  (example)
         └─────────────────────────────┘
```

### After selecting RELIANCE from dropdown

→ POST → chip appears PENDING → READY → chart switches.

### Remove TCS while viewing NIFTY

→ TCS chip gone; NIFTY chart unchanged.

---

## 8. Testing

### Backend

- `search("rel", 15)` returns RELIANCE near top.
- `search("nifty", 15)` returns Nifty 50 index.
- `search("x", 15)` → `[]` if min length 2 enforced server-side too.
- Case/whitespace insensitive.
- Does not return FO rows.
- Limit respected.

### Frontend (manual / component)

- Type `inf` → INFY appears; Enter adds.
- Chip × on non-active removes without chart thrash.
- Chip × on active switches to next READY.
- Already-on-list row not double-added (disabled).
- Network fail on search shows non-blocking empty/error under input.

### Regression

- Existing watchlist GET/POST/DELETE tests green.
- Seed startup + live feed unchanged.

---

## 9. PR plan

| PR | Title | Deliverable |
|----|-------|-------------|
| **PR1** | Instrument search API | `InstrumentMasterCache.search`, `GET /api/instruments/search`, unit + MockMvc tests |
| **PR2** | Optional POST `instrumentKey` | `AddWatchlistRequest` accepts key or symbol; service path; tests |
| **PR3** | FE WatchlistBar + InstrumentSearch | Replace SymbolSwitcher free-text/remove-active; CSS; wire ChartContainer |

**Suggested ship order:** PR1 → PR3 (PR2 can merge with PR1 or PR3).  
**Estimate:** ~1 small backend PR + 1 FE PR; no schema / no infra.

---

## 10. Open questions (defaults if you agree)

| # | Question | Default if silent |
|---|----------|-------------------|
| OQ1 | Confirm dialog on remove? | **No** |
| OQ2 | Hide vs disable already-listed in dropdown? | **Disable + “On list”** |
| OQ3 | Auto-add on suggestion click vs explicit Add button? | **Click/Enter adds immediately**; keep optional Add button for free-text |
| OQ4 | Search contains vs prefix-only? | **Prefix first, then contains** |
| OQ5 | Chips in header vs dropdown list of watchlist only? | **Chips** (delete next to each) |

---

## 11. Out of scope follow-ups

- Virtualized full master browser.
- Recent / favorites.
- Soft-delete Postgres watchlist.
- Mobile bottom-sheet instrument picker.

---

## 12. Summary

Build a **watchlist chip bar** (select + per-symbol delete) and an **instrument combobox** backed by a new **in-memory search API** on the existing master cache. Reuse today’s add/remove orchestration; only the discovery UX and remove placement change.

**Ready to implement after you confirm OQ defaults (or override them).**

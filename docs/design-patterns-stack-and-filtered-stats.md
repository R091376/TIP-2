# Design plan: Classical patterns, high-probability stack, filtered journal stats

**Status:** Planned — **not implemented**. Revisit when ready to build.  
**Last updated:** 2026-08-06  
**Related:** `docs/modules/journal.md`, pattern docs under `docs/patterns/`, research discussion on high-success setups.

---

## 1. Goals

1. Add classical multi-pivot patterns: **double bottom**, **inverse head & shoulders**, **head & shoulders**, **high tight flag**.
2. Maintain a **high-probability stack** (confluence grade) on top of detectors.
3. Let research UI **filter raw journal instances** and **recompute stats on the fly** (session hours, flags, rails, etc.) — not only pre-aggregated `(symbol, type, TF)` buckets.

---

## 2. Phase roadmap (implementation later)

| Phase | Scope | Depends on | Outcome |
|-------|--------|------------|---------|
| **P0** | Filtered research stats API + Stats UI filters | Existing journal only | **Shipped** — see `design-composable-stack-filters.md` |
| **P1** | Confluence score/grade (persist + optional live compute) | P0 preferred | A / A+ stack without new pattern types |
| **P2** | Double bottom detector | Pivot helpers in `structure.py` | First multi-pivot classical pattern |
| **P3** | H&S + inverse H&S shared geometry engine | P2 patterns | Neckline + 3-pivot lifecycle |
| **P4** | High tight flag (primarily `1d`, optional `4h`) | Long lookback candles | Rare momentum A+ setups |
| **P5** | Candle replay / offline parameter sweep | Candle store | True historical backtests (product deferred item) |

**Recommended build order:** P0 → P1 → P2 → P3 → P4.  
P0 answers “what already works in *our* NSE watchlist journal” with UI filters.

---

## 3. New pattern detectors (later)

### 3.1 Shared requirements (all new types)

- Closed-candle only, non-repainting (same as existing evaluators).
- Plug into `PatternEvaluator` like breakout / structure.
- Extend `PatternType` enum + config knobs + DB CHECK / migration.
- Virtual rails: entry / stop / target / ATR; terminal Succeeded / Failed / Expired.
- Persist geometry in instance **metadata** (or dedicated JSON column): pivots, neckline, flagpole.
- Chart overlay + Learn docs + unit tests under `backend/tests/patterns/`.
- Stats automatically flow once outcomes close (existing journal path).

### 3.2 Double bottom (P2) — implement first among classics

| Item | Rule sketch |
|------|-------------|
| Structure | Two pivot lows within tolerance; intervening peak = confirmation line |
| Detect | Close above confirmation line (or configurable break rule) |
| Stop | Below lower trough (− buffer / ATR) |
| Target | Pattern height projected above confirmation, or ATR multiple |
| Filters | Prefer second trough depth band; volume on break optional |

### 3.3 Head & shoulders / inverse H&S (P3)

| Item | Rule sketch |
|------|-------------|
| Structure | Three pivots (shoulder–head–shoulder) with geometry tolerances |
| Neckline | Line through the two intervening extremes; break + close confirm |
| Stop | Beyond right shoulder |
| Target | Head-to-neckline measured move (× % meeting target optional) |
| Lifecycle | Detected at neckline break; optional retest of neckline |

Share one geometry module; invert for top vs bottom.

### 3.4 High tight flag (P4)

| Item | Rule sketch |
|------|-------------|
| Pole | ≥ ~90% rise in ≤ ~N bars (config; classic ~42 daily bars) |
| Flag | Shallow consolidation after pole high |
| Entry | Break above flag high |
| Stop | Below flag low (risk can be large — show planned R:R clearly) |
| TF | Default enable on `1d` only; rare by design |

### 3.5 Schema touchpoints for classical patterns

- Migration: extend `pattern_type` CHECK.
- Prefer `geometry JSONB` (or reuse event `metadata`) for shoulders/neckline/flagpole — current `ActivePattern` flat fields are insufficient alone.
- `detector_version` for rule evolution.

---

## 4. High-probability stack (P1)

### 4.1 Concept

Do **not** hardcode “90% patterns.”  
Score each instance from **confluence factors** already present (or cheaply joinable), assign grade **B / A / A+**, and measure real WR from journal.

### 4.2 Example factor table (long breakout)

| Factor | Example weight | Data source today |
|--------|----------------|-------------------|
| Volume OK at detect | +15 | `volume_ok_at_detect` |
| Confirmed | +10 | `flag_confirmed` |
| Retested hold | +15 | `flag_retested` |
| Strengthened | +5 | `flag_strengthened` |
| Planned R:R ≥ threshold | +10 | rails (entry/stop/target/ATR) |
| Direction long/short bias | config | `direction` |
| HTF structure aligned | +15 | nearby `higher_high` / `lower_low` or HTF scan |
| Trigger candle nearby | +10 | engulfing/hammer/inside_bar window join |
| Session quality window | +10 | detect candle IST hour band |
| Clean pre-range | +10 | consolidation co-presence |

Persist optional: `confluence_score`, `confluence_grade`, `confluence_factors` JSON.  
Or **compute at query time** for research (see §5) until grades stabilize.

### 4.3 Product use

- Alerts: filter “A+ only”.
- Stats: WR / expectancy **by grade**.
- Learn: explain why a setup scored high.

---

## 5. Filtered journal stats (P0 — research UI focus)

### 5.1 Problem with current stats

`pattern_statistics` is a **running aggregate** keyed only by:

```text
(symbol_id, pattern_type, timeframe)
```

Updated on terminal outcomes in `PostgresPatternJournal._upsert_statistics`.

**Cannot** answer:

- Detects only **09:30–15:00 IST**
- Only `flag_retested = true`
- Only `volume_ok_at_detect`
- Planned R:R ≥ 1.5
- Date range last 30 days
- Combined multi-filter “stack simulation”

UI filters on the **current** `/api/pattern-statistics` response can only subset **pre-baked buckets** (symbol / type / TF already in the API). They cannot recompute rates under new predicates.

### 5.2 What the raw journal already stores (filterable)

**`pattern_instances`**

| Column | Filter / research use |
|--------|------------------------|
| `symbol_id` | Symbol / multi-select |
| `pattern_type` | Pattern multi-select |
| `timeframe` | TF multi-select (`1m`…`1d`) |
| `direction` | long / short |
| `status` | open vs closed stages |
| `flag_confirmed` | Confirmation stack |
| `flag_retested` | Retest stack (high value) |
| `flag_strengthened` | Extension stack |
| `volume_ok_at_detect` | Volume stack |
| `confirmation_mode_used` | volume / close / both / fallback |
| `detector_version` | Rule version compare |
| `detected_at` | Wall-clock detect time (UTC) |
| `detect_candle_time` | **Candle bucket epoch — preferred for session-hour filters** |
| `entry_price`, `stop_level`, `target_level`, `atr_at_detect` | Planned risk/reward filters |
| `volume_at_detect` | Absolute / relative volume (relative needs SMA context) |
| `retest_floor` | Retest geometry present |
| `ended_at` | Resolution date |

**`pattern_outcomes`** (closed only)

| Column | Filter / metric use |
|--------|---------------------|
| `final_outcome` | S / F / E |
| `duration_candles`, `duration_seconds` | Time-in-trade filters & avgs |
| `max_favorable_r`, `max_adverse_r`, `move_r` | Path quality, expectancy |
| `reason` | session_close, max_candles, stop, target, … |
| `closed_at` | Close-time window |

**`pattern_events`**

| Use |
|-----|
| Stage timeline; “reached retested before fail”; multi-stage funnels |
| Day feed already uses IST calendar day (`list_session_day_alerts`) |

**Indexes already useful:** `detected_at`, `(symbol_id, pattern_type, timeframe, status)`.  
**May add later:** expression index on IST hour of `detect_candle_time`, or composite for research queries.

### 5.3 Session hour filter (09:30–15:00 IST) — analysis

User intent: only count setups whose **detect candle** falls in the liquid cash window, e.g. **09:30–15:00 IST** (skip open auction noise and optional last half-hour).

| Source | Pros | Cons |
|--------|------|------|
| `detect_candle_time` | Tied to bar that triggered pattern; matches “when the setup formed” | Need consistent sec vs ms handling (alerts path already normalizes) |
| `detected_at` | Simple timestamptz | Processing lag; startup hydrate; not equal to candle open |

**Recommendation:** filter on **IST time-of-day of `detect_candle_time`** (convert epoch → Asia/Kolkata).

```text
include if time_ist(detect_candle_time) ∈ [start, end]
default example: [09:30, 15:00]
```

**TF caveats**

| TF | Session hour filter meaning |
|----|----------------------------|
| `1m` / `5m` / `15m` / `1h` | High value — true intraday quality window |
| `4h` | Weak — bar spans large wall time; optional disable |
| `1d` | **Not meaningful** for 09:30–15:00; ignore filter or document N/A |

NSE cash session is 09:15–15:30 IST; product default band should be configurable.

### 5.4 What “filter-driven high probability stack” means in UI

Without persisting a grade, the UI can **simulate the stack** by requiring filters that match confluence factors:

| Stack idea | UI filter(s) |
|------------|----------------|
| Volume-backed | `volume_ok_at_detect = true` |
| Confirmed only | `flag_confirmed = true` |
| Retest quality | `flag_retested = true` |
| Full lifecycle quality | confirmed + retested (+ optional strengthened) |
| Directional | `direction = long` |
| Decent plan | planned_rr ≥ 1.5 (computed from rails) |
| Session quality | detect IST hour in [09:30, 15:00] |
| Pattern family | type ∈ {breakout, volume_breakout, …} |
| TF band | timeframe ∈ {5m, 15m, 1h} |
| Resolved only | outcome ∈ {succeeded, failed} (exclude expired) |
| Exclude recovery junk | `reason != startup_recovery` |

Each combination is a **virtual stack definition**. Changing filters recomputes S/F/E, resolved WR, avg MFE/MAE/move, expectancy, etc. on the **matching instance set**.

### 5.5 Metrics recomputed under filters (API response)

Same spirit as current dashboard, but from filtered instance set:

| Metric | Definition |
|--------|------------|
| `sampleSize` | matching closed (or include open — default closed) |
| `successCount` / `failCount` / `expiredCount` | by `final_outcome` |
| `successRate` | S / n |
| `resolvedSuccessRate` | S / (S+F) |
| `avgMoveR`, `avgMfeR`, `avgMaeR` | means over non-null |
| `avgDurationCandles` | mean |
| `avgPlannedRr`, `avgRiskR`, `avgRewardR` | via `compute_planned_rails` |
| `expectancyR` | mean signed `move_r` over resolved (or WR-based) |
| `avgWinMoveR` / `avgLossMoveR` | split |
| `medianDuration`, percentiles optional | richer later |

**Grouping modes** (query param):

- `groupBy=symbol,patternType,timeframe` (current shape)
- `groupBy=patternType,timeframe`
- `groupBy=patternType`
- `groupBy=none` → single global summary for the filter set
- later: `groupBy=hourBucket` for session heatmap

**Gate:** keep `minSampleSize` (default 20); return `insufficient_history` for thin groups but still return raw counts.

### 5.6 API sketch (not implemented)

```http
GET /api/pattern-statistics/query
  ?symbolId=...                    # repeatable or comma list; default active watchlist
  &patternType=breakout,breakdown
  &timeframe=5m,15m,1h
  &direction=long
  &flagConfirmed=true
  &flagRetested=true
  &flagStrengthened=          # omit = any
  &volumeOkAtDetect=true
  &confirmationMode=both
  &detectTimeIstStart=09:30
  &detectTimeIstEnd=15:00
  &detectedFrom=2026-01-01
  &detectedTo=2026-08-06
  &outcome=succeeded,failed,expired   # or resolvedOnly=true
  &excludeReasons=startup_recovery
  &minPlannedRr=1.5
  &maxPlannedRr=
  &minAtr=
  &groupBy=symbol,patternType,timeframe
  &minSampleSize=20
```

**Implementation approach (preferred):** SQL aggregate over `pattern_instances` ⨝ `pattern_outcomes` with WHERE clauses.  
**Do not** try to filter the pre-aggregated `pattern_statistics` table for these dimensions.

Optional cache: materialize nothing until query volume hurts; then add summary tables or Redis for popular filter presets.

### 5.7 Pure frontend filtering — limits

| Approach | Viable? | Why |
|----------|---------|-----|
| Filter current bulk stats JSON in browser | **No** for stack research | Pre-aggregated; no per-instance dimensions |
| Download all instances to browser and aggregate | Only for tiny journals | Watchlist × TF × days grows fast; no pagination story |
| Backend query-time aggregation | **Yes** | Correct, scalable, one source of truth |

**Conclusion:** UI can **own the filter controls and presentation**, but **stats under filters must be computed server-side** from instances+outcomes.

### 5.8 Cross-instance confluence (advanced, still data-possible)

“Breakout that also had engulfing within N bars” is **not** a column today, but is queryable:

```text
instance A (breakout) join instance B (bullish_engulfing)
  same symbol_id, same timeframe
  |detect_candle_time_A - detect_candle_time_B| ≤ window
  same direction
```

Heavy but feasible as a later filter (`nearPatternTypes=bullish_engulfing&nearWindowBars=3`).  
True HTF alignment may need evaluating higher-TF series at detect time (candle engine), not only journal join.

### 5.9 What UI filters can expose **without** new detectors

| Filter control | Backend field / compute | Stack relevance |
|----------------|-------------------------|-----------------|
| Pattern multi-select | `pattern_type` | Base setup family |
| Timeframe multi-select | `timeframe` | Noise vs quality |
| Symbol multi / search | `symbol_id` | Per-name edge |
| Direction | `direction` | Long-only stacks |
| Detect date range | `detected_at` or candle day | Regime windows |
| **Detect time IST range** | `detect_candle_time` → IST TOD | Session quality (your 9:30–15:00) |
| Confirmed | `flag_confirmed` | Confirmation stack |
| Retested | `flag_retested` | High-prob entry quality |
| Strengthened | `flag_strengthened` | Momentum |
| Volume OK | `volume_ok_at_detect` | Breakout validity |
| Confirmation mode | `confirmation_mode_used` | Mode A/B test |
| Outcome set | `final_outcome` | Resolved-only research |
| Exclude expire reasons | `reason` | Drop session_close noise experiments |
| Min/max planned R:R | rails math | Offer quality |
| Detector version | `detector_version` | Before/after rule change |
| Min duration / max duration | outcome durations | Scalp vs swing behavior |

### 5.10 What UI **cannot** do honestly until more data/features

| Desired filter | Gap |
|----------------|-----|
| “A+ grade” as first-class without definition | Needs score rules (P1) or manual filter presets |
| Index regime (Nifty above MA) | Not in journal; needs market context join |
| News blackout windows | External calendar |
| True relative volume vs SMA20 | Have absolute `volume_at_detect`; SMA at detect not stored (can recompute from candles if history kept) |
| Classical H&S geometry quality | Pattern not implemented yet |
| Guaranteed 90% WR display | Empirical only; always show n + CI later |

### 5.11 UX sketch for Stats page (later)

Keep existing **bulk ranking** as default “fast path” (pre-aggregated).

Add **Research mode** toggle:

1. Filter bar: TF multi, pattern multi, IST time range, flag checkboxes, volume OK, direction, date range, planned RR min, resolved-only.
2. Apply → calls `/api/pattern-statistics/query`.
3. Table same columns + expectancy; show **active filter chips** and **n after filters**.
4. Empty/thin states: “n=7 &lt; 20 — counts only”.
5. Saved presets: e.g. `Retest+Volume+09:30–15:00` as named stack.

Optional secondary views:

- Funnel: Detected → Confirmed → Retested → Succeeded rates  
- Hour-of-day heatmap of resolved WR (groupBy hour)  
- Compare two filter presets side-by-side  

### 5.12 Performance notes

- Always scope to active watchlist symbols by default (current product rule).
- Cap date range (e.g. max 180 days) or require pagination for instance drill-down.
- Aggregate in SQL (`FILTER`, `AVG`, `COUNT`) — avoid loading all rows into Python when possible.
- For IST hour: store generated column later if slow:

  `detect_minute_ist = ...` from `detect_candle_time`

### 5.13 Security / product

- Same auth as current pattern-statistics (authenticated users).
- Label: research / virtual outcomes — not brokerage advice (existing disclaimer tone).
- Admin-only optional if query cost becomes high; default match current Dashboard access.

---

## 6. Relationship: filters vs persisted stack

| Approach | Pros | Cons |
|----------|------|------|
| **UI + query filters only** | Fast to ship; no schema; exploratory | User must know which boxes = “stack”; no alert-time grade |
| **Persisted confluence grade** | Alerts, consistent definition, easy “A+ only” | Must version scoring rules; backfill |
| **Both** | Research explores filters → lock winning preset into grade formula | Best long-term |

**Product recommendation:**  
Ship **filtered stats (P0)** first so the team *discovers* which combinations raise probability on real journal data, then freeze winners into **P1 grade** for alerts.

---

## 7. Testing plan (when implementing)

- Unit: IST hour boundary (09:29 exclude, 09:30 include, 15:00 policy inclusive/exclusive).
- Unit: planned RR filter + consolidation exclusion (existing rails rules).
- Integration: seed N instances with varied flags/hours; assert counts/WR.
- FE: filter chip state ↔ query string; ready gate; empty watchlist.
- Regression: existing `/api/pattern-statistics` unchanged behavior.

---

## 8. Explicit non-goals (this plan)

- Live broker auto-trading from stack grades.
- Claiming fixed 90% success in UI copy.
- Replacing pre-aggregated table (keep for cheap dashboard).
- Full multi-year market-wide backtester (separate deferred work).

---

## 9. Decision log (fill when implementing)

| Decision | Choice | Date |
|----------|--------|------|
| Detect session clock field | Prefer `detect_candle_time` → IST | TBD |
| Default IST window | e.g. 09:30–15:00 | TBD |
| Inclusive end time | TBD | TBD |
| Query API path | `/api/pattern-statistics/query` | TBD |
| Persist grade in P1? | TBD after P0 findings | TBD |

---

## 10. Summary

- **Classical patterns + stack:** planned in P2–P4 and P1; do later.
- **High-probability stack in UI now (conceptually):** almost all stack *ingredients already in journal*; expose them as **filters** and **recompute stats server-side**.
- **Time window 9:30–15:00:** fully feasible via `detect_candle_time` + IST conversion; high value on intraday TFs.
- **Cannot** do real filtered stack stats by client-side filtering of current bulk aggregates alone.
- **P0 is the right next build** when implementation starts: research query API + Stats Research mode.

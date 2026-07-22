# Trading Intelligence Platform — MVP 1 Implementation Plan

How to use this: hand one phase at a time to your AI coding tool, not the whole document at once. Each phase has a clear "done when" checkpoint — confirm that before moving to the next phase. This keeps the agent's context focused and gives you natural checkpoints to test against real data.

Reference documents this plan assumes you have alongside it: the MVP 1 Consolidated Technical Design (v1.0) and the Pattern Definitions (v1.0 Final).

**One assumption made to keep this concrete** — alert granularity (an item left open in the design doc): alerts fire by default on **Detected, Confirmed, Succeeded, Failed** only; **Retested** and **Strengthened** are logged to the Pattern Journal silently but don't push a notification. This is a config flag, not hardcoded — change it if you want more/fewer alerts once you see real volume.

---

## Phase 0 — Project scaffolding

**Goal:** empty but runnable skeleton, nothing functional yet.

- [ ] Initialize a monorepo (or two repos): `backend/` (Node.js + TypeScript + Fastify), `frontend/` (React + TypeScript + Vite).
- [ ] Backend: set up TypeScript config, ESLint, a `/health` endpoint, and a `.env` file for config (never commit secrets).
- [ ] Set up PostgreSQL locally (Docker Compose is easiest) and a migration tool (Drizzle or Prisma — either is fine, pick one and stay consistent).
- [ ] Define a shared `config.ts` (or `.env` schema) holding every tunable parameter from the design docs as named constants, not magic numbers scattered in code:
  - `WATCHLIST_MAX_SYMBOLS=10`
  - `BREAKOUT_LOOKBACK_CANDLES=20`
  - `BREAKOUT_CONFIRMATION_MODE=both` (`close` | `volume` | `both`)
  - `BREAKOUT_VOLUME_MULTIPLIER=1.5`
  - `BREAKOUT_RETEST_ATR_MULT=0.25`
  - `BREAKOUT_STRENGTHEN_ATR_MULT=1.0`
  - `BREAKOUT_SUCCESS_RR=2.0`
  - `CONSOLIDATION_WINDOW=10`
  - `CONSOLIDATION_ATR_MULT=1.5`
  - `CONSOLIDATION_MAX_DURATION_MULT=3`
  - `VOLUME_BREAKOUT_MULTIPLIER=2.0`
  - `VOLUME_BREAKOUT_MIN_ATR_MOVE=0.5`
  - `STATS_MIN_SAMPLE_SIZE=30`
  - `ALERT_STAGES=detected,confirmed,succeeded,failed`
  - `ATR_PERIOD=14`

**Done when:** backend starts, `/health` returns 200, Postgres connects, config loads from env with the defaults above.

---

## Phase 1 — Dhan broker connectivity (read-only market data)

**Goal:** authenticate with Dhan and pull both historical and live tick data for a single hardcoded symbol into the console — no candles, no UI yet.

- [ ] Implement Dhan REST auth flow (API key/token from your Dhan developer account — confirm current auth mechanism against DhanHQ docs, since your design doc flags this as unverified).
- [ ] Implement a historical-candle fetch call for one symbol, one day, print the response.
- [ ] Implement the Dhan WebSocket connection (`wss://api-feed.dhan.co?...`) for live ticks:
  - Handle the documented binary message format (Little Endian, 8-byte header + payload).
  - Handle the server's ping every 10 seconds (keep-alive).
  - Subscribe to one instrument, log incoming ticks to console.
  - Handle disconnect/reconnect with backoff.
- [ ] No order-placement code at all in this phase — this project never executes trades, don't build toward it.

**Done when:** you can see live ticks for one real NSE symbol printing in your terminal during market hours, and a historical candle fetch returns real data.

---

## Phase 2 — Market Engine: candles from ticks

**Goal:** turn the tick stream from Phase 1 into live, multi-timeframe candles for one symbol.

- [ ] Build the Candle Generator: given a tick (price, volume, timestamp), update the in-progress candle for each timeframe (1m, 3m, 5m, 15m, 30m, 1h, 1d), aligned to exchange time boundaries (candles start/end on the clock, not on first-tick-received).
- [ ] Close a candle when its timeframe boundary passes; open the next one.
- [ ] Publish events on an in-process event bus: `CandleUpdated`, `CandleClosed`, `NewTradingSession`, `SymbolActivated`, `SymbolDeactivated`. Keep this bus in-process (e.g. Node `EventEmitter` or a simple pub/sub) — no external message queue needed at this scale.
- [ ] Compute ATR(14) per symbol/timeframe as candles close, since every pattern detector depends on it.
- [ ] Keep candles in memory only (a `Map` keyed by symbol+timeframe); nothing persisted yet.

**Done when:** for one symbol, you can print a running log of 1-min and 5-min candles closing correctly during market hours, each with a computed ATR(14).

---

## Phase 3 — Watchlist (multi-symbol; hard cap 50; in-memory first)

**Goal:** move from one hardcoded symbol to a real, editable multi-symbol watchlist.

**Approach (delivered — see `Multi-Symbol-Watchlist-Design-v1.0.md` rev 5):** in-memory `WatchlistRepository` first (not Postgres-first); hard product cap **50**; startup seed **NIFTY 50 index + 9 top equities**. Postgres soft-delete (`removed_at` / `is_active`) is a later drop-in.

- [x] `WatchlistRepository` + ordered `InMemoryWatchlistRepository` (hard-delete on remove; `findPrimary` = first public-active).
- [x] REST: `GET/POST/DELETE /api/watchlist`; per-symbol candles `GET /api/symbols/{symbolId}/candles`; `/api/market/*` primary-aware compat shim.
- [x] Enforce hard cap **50** server-side (reject add with **409** when active count ≥ 50; soft-warn at 40 optional).
- [x] Startup seed: NIFTY 50 index + 9 top Nifty equities (ordered static list; index is primary).
- [x] Resolve trading symbols via local Upstox NSE instrument master cache (no live search API per add).
- [x] Wire watchlist changes to multi-instrument feed + multi-bootstrap: add → seed all TFs + subscribe; remove → unsubscribe + evict candle/throttle state without disturbing other symbols.
- [x] WS subscribe validates against the active watchlist (not a single hardcoded default).
- [x] Frontend: thin watchlist-driven symbol switcher (chart + WS rebind; timeframe/chart type preserved).

**Done when:** app starts with index + 9 equities and charts the index; you can add/remove symbols via API during market hours without affecting others; the **51st** active symbol is rejected; FE switcher changes chart + WS subscription.

---

## Phase 4 — Database schema (full)

**Goal:** all permanent-data tables exist and are migrated.

- [ ] `pattern_instances`: `id, symbol_id, pattern_type, timeframe, detected_at, reference_level, status, ended_at`.
- [ ] `pattern_events`: `id, pattern_instance_id, event_type, event_time, price_at_event` (one row per lifecycle transition).
- [ ] `pattern_outcomes`: `pattern_instance_id, final_outcome, duration, max_favorable_move, max_adverse_move`.
- [ ] `pattern_statistics`: `symbol_id, pattern_type, timeframe, sample_size, success_rate, avg_move, avg_duration, updated_at`.
- [ ] `users`: `id, settings` (single row is fine for MVP 1, but keep the table).
- [ ] Add indexes on `pattern_instances(symbol_id, pattern_type, timeframe, status)` — you'll query this constantly.

**Done when:** migrations run clean on an empty database and produce all five tables with the columns above.

---

## Phase 5 — Pattern Intelligence: Breakout & Breakdown detectors

**Goal:** the first two (mirror-image) detectors working end-to-end against live candles, writing to the Pattern Journal.

- [ ] Implement Breakout as a pure function: given the last 20 closed candles + ATR(14) for a symbol/timeframe, return whether a new instance should be Detected.
- [ ] Implement the lifecycle state machine (Detected → Confirmed → Retested → Strengthened → Succeeded/Failed) as its own module, independent of the detector logic, so Breakdown (and later detectors) can reuse it.
- [ ] Wire confirmation mode (`close` / `volume` / `both`) from config.
- [ ] On every relevant candle close, evaluate active pattern instances for that symbol/timeframe against the lifecycle rules, and write a `pattern_events` row on every transition.
- [ ] On Succeeded/Failed, write the `pattern_outcomes` row and close the instance.
- [ ] Implement Breakdown by reusing the same lifecycle module with mirrored comparisons.

**Done when:** for a real symbol during market hours, you can see a `pattern_instances` row appear on a genuine breakout, watch its `pattern_events` rows accumulate through the lifecycle in the database, and see it close out with an outcome.

---

## Phase 6 — Consolidation & Volume Breakout detectors

**Goal:** the remaining two MVP 1 detectors, same pattern as Phase 5.

- [ ] Consolidation: 10-candle range ≤ 1.5× ATR(14); track duration; resolve via a linked Breakout/Breakdown instance (store the link, e.g. a nullable `resolved_by_pattern_instance_id` column) or fail past 30 candles.
- [ ] Volume Breakout: single-candle volume ≥ 2× avg AND price move ≥ 0.5× ATR(14); independent detector (allowed to co-fire with Breakout/Breakdown per the locked decision).

**Done when:** all four detectors are running concurrently on all watchlist symbols without interfering with each other, each writing correctly to the Journal tables.

---

## Phase 7 — Alerts

**Goal:** real-time notification when a pattern crosses an alert-worthy stage.

- [ ] Subscribe to lifecycle transition events; filter to the configured `ALERT_STAGES` (default: detected, confirmed, succeeded, failed).
- [ ] Alert payload: symbol, pattern type, timeframe, stage, price, time. No recommendation language anywhere in the payload or UI copy.
- [ ] Push mechanism: WebSocket push to the frontend is enough for MVP 1 — no need for external push notification infra yet.

**Done when:** an alert appears in a simple console/log stream within a couple seconds of a real pattern transition during market hours.

---

## Phase 8 — Pattern Statistics & Confidence (built, gated)

**Goal:** compute stats continuously, but don't expose them until they're trustworthy.

- [ ] On every `pattern_outcomes` write, update the corresponding `pattern_statistics` row (sample_size, success_rate, avg_move, avg_duration) for that symbol/pattern/timeframe bucket.
- [ ] API endpoint for stats returns the row only if `sample_size >= STATS_MIN_SAMPLE_SIZE`; otherwise returns an explicit "insufficient history" response — never a misleading partial number.

**Done when:** stats accumulate correctly in the database from day one, but the API/UI shows "insufficient history" for every bucket until real usage crosses the threshold (which will take a while — that's expected and correct).

---

## Phase 9 — Frontend: Chart, Watchlist, Alerts

**Goal:** a usable single-page app.

- [ ] Watchlist panel: add/remove symbols (respecting the 10-symbol cap with a clear error message), list active symbols.
- [ ] Chart panel: TradingView Lightweight Charts rendering live + historical candles for the selected symbol/timeframe, with active pattern instances overlaid (e.g. a marker at the reference level, shaded retest zone).
- [ ] Alerts feed: live-updating list, newest first, symbol/pattern/stage/price/time.
- [ ] No trade-entry UI anywhere — nothing in the frontend should imply order placement.

**Done when:** you can open the app, manage your watchlist, watch a live chart update, and see alerts appear in real time during market hours.

---

## Phase 10 — Deployment & market-hours scheduling

**Goal:** running unattended in the cloud during NSE hours only.

- [ ] Containerize backend + frontend (Docker).
- [ ] Deploy to your chosen cloud provider (a single small instance is enough — no need for autoscaling or multi-region at this scale).
- [ ] Add a scheduler (cron, cloud scheduler, or a simple always-on process with an internal clock check) that starts the app ahead of 09:15 IST and stops it after 15:30 IST, with margin on each side for pre-market historical backfill and clean shutdown.
- [ ] Implement session-recovery on startup: re-fetch today's historical candles up to "now" from Dhan before resuming live ticks, so a restart mid-session doesn't leave gaps in candle state. Test this deliberately (kill the process mid-session, restart it, verify candles are continuous) — don't assume it works.
- [ ] Reconcile any pattern instances that were "in flight" at the moment of a crash (mark them appropriately) rather than silently losing them.

**Done when:** you can deploy, the app auto-starts before market open and auto-stops after close for a full real trading day, and a mid-session restart recovers cleanly.

---

## Phase 11 — Backtest harness (before trusting the thresholds live)

**Goal:** validate the locked pattern definitions against real historical data before relying on them, per the design doc's open item.

- [ ] Build a standalone script (not part of the live app) that replays historical candles for your 10 symbols through the same detector logic used live, and reports how often each pattern fires, its historical success rate, and average outcome — using the same lifecycle/threshold code as production, not a reimplementation.
- [ ] Compare results against what "feels right" for a few patterns you recognize by eye, to sanity-check the thresholds before going live with real capital decisions riding on the alerts.

**Done when:** you have a report of historical pattern frequency and outcomes per symbol/pattern/timeframe, and you've either confirmed the current thresholds or adjusted the config values in Phase 0 based on what you saw.

---

## Suggested order to hand this to your AI coding tool

Give it one phase at a time, in order, and paste in the design doc + pattern definitions doc as context at the start. After each phase, actually run it against live (or at least historical) Dhan data before moving on — don't let the agent chain multiple phases together on faith, since a Candle Engine bug in Phase 2 will silently corrupt everything built on top of it in Phases 5–8.

# Architectural Decisions — Trading Intelligence Platform (TIP)

| Field | Value |
|---|---|
| **Document** | Architectural Decision Log |
| **Date** | 2026-07-10 |
| **Status** | Living document (reflects multi-symbol watchlist delivery) |
| **Related** | `Multi-Symbol-Watchlist-Design-v1.0.md`, `Architecture-Design-v1.0.md`, `Data-Flow-and-Frontend-API-Spec-v1.0.md` |

This file records **product and technical decisions** that shape the current multi-symbol platform. Prefer this log when implementing follow-on work (Postgres, patterns, ring buffer) so choices stay consistent.

Decision IDs (`KD*`) match the multi-symbol design where applicable. Newer items use `AD*` for post-design / implementation discoveries.

---

## 1. Scope and product stance

### AD0 — Read-only intelligence platform (no order execution)

| | |
|---|---|
| **Status** | Accepted (project baseline) |
| **Decision** | TIP is **read-only**: ingest market data, build candles, stream to UI. No order placement, OMS, or brokerage execution. |
| **Rationale** | Focus product on charts, watchlist, and future pattern/alerts without regulatory/execution complexity. |
| **Consequences** | Upstox is used as a **data** provider only; auth token is for market APIs/feed. |

### AD1 — Platform stack: Java Spring Boot backend + React/Vite frontend

| | |
|---|---|
| **Status** | Accepted |
| **Decision** | Backend: **Java 17**, **Spring Boot 3.3**, Upstox **Java SDK**. Frontend: **React + Vite**, TradingView **Lightweight Charts**. |
| **Rationale** | Upstox Java SDK for historical + Market Data Feed V3; simple SPA for charting. |
| **Consequences** | Config via `application.yml` / env; FE proxies `/api` and `/ws` to `:8080`. |

---

## 2. Multi-symbol watchlist — persistence & capacity

### KD1 — In-memory `WatchlistRepository` first; Postgres later

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | Introduce `WatchlistRepository` with production impl **`InMemoryWatchlistRepository`**. Postgres is a later drop-in. |
| **Rationale** | Unblocks multi-symbol engine + feed without waiting on DB schema/migrations. Interface keeps migration clean. |
| **Consequences** | Restart **loses** user-added symbols; only config seed returns. No durability until Postgres. |

### KD27 — In-memory hard-delete; Postgres soft-delete later

| | |
|---|---|
| **Status** | Accepted |
| **Decision** | **v1 (in-memory):** hard-delete on remove. **Postgres phase:** soft-delete (`removed_at`, `is_active`) so pattern/journal history can join watchlist rows after remove. |
| **Rationale** | No durable store yet → hard-delete is correct. Soft-delete preserves history for future journal/pattern tables. |
| **Consequences** | Postgres schema must include soft-delete columns; public “active” queries filter `is_active = true`. |

### KD2 — Hard product cap 50; soft-warn at 40

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | `tip.watchlist.hard-max-size: 50` — reject add with **409** when `countActive() >= 50`. Soft-warn log at **40**. |
| **Rationale** | Bounds memory, bootstrap latency, and operational load. Upstox V3 Full allows far more keys (~2000); **50 is a product/memory choice**, not an Upstox hard limit. |
| **Consequences** | Capacity check uses a short global lock around count+insert to avoid concurrent overshoot. |

### KD3 / KD15 — Startup seed: NIFTY 50 index + 9 top equities

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | Cold start seeds **exactly 10** instruments from ordered config: **NIFTY 50 index first**, then 9 pinned Nifty equities (e.g. RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK, HINDUNILVR, ITC, SBIN, BHARTIARTL). |
| **Rationale** | Exercises **INDEX + EQ** paths early. Master file has no “Nifty membership / top weight”; list is pinned in `tip.watchlist.seed-symbols`. Index key pinned via `seed-instrument-keys`. |
| **Consequences** | Primary chart default = **first seed** (NIFTY 50). Equities resolve via master when not pinned. Failed resolve skips that seed (others continue). |

### KD13 — Primary symbol = insertion-order first public-active

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | `findPrimary()` = first **public-active** entry in **LinkedHashMap insertion order**. Do **not** sort by `addedAt` in v1. |
| **Rationale** | `ConcurrentHashMap` iteration is not stable; seed list order puts NIFTY first. |
| **Consequences** | Postgres later may use `ORDER BY added_at ASC`. `/api/market/*` shim uses primary. |

### KD26 — REMOVING visibility rules

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | **Public APIs** (`findAllActive`, `findPrimary`, `containsSymbolId`, count): exclude `REMOVING`. **`findBySymbolId`**: still returns REMOVING until hard-delete (for bootstrap cancel / remove orchestration). |
| **Rationale** | Dying symbols must not be chartable or WS-subscribable; cancel still needs to observe REMOVING. |

---

## 3. Identity, resolution, instruments

### KD4 — `symbolId` = Upstox `instrument_key`

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | Canonical ID everywhere is instrument key, e.g. `NSE_INDEX|Nifty 50`, `NSE_EQ|INE002A01018`. |
| **Rationale** | Stable, unique, matches events/WS/Data-Flow spec. |
| **Consequences** | Paths need encoding (`|`, spaces). Use `{symbolId:.+}` and `encodeURIComponent` (KD22). |

### KD5 / KD19 — Add by trading symbol only; no client instrument_key

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | `POST /api/watchlist` body is `{"symbol":"RELIANCE"}`. Resolve server-side. **Do not** accept client-supplied raw instrument keys in v1. |
| **Rationale** | Better UX; prevents arbitrary feed key injection. |

### KD6 — Local NSE instrument master cache

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | Download/cache Upstox `NSE.json.gz`; index **NSE_EQ (EQ/BE)** + **NSE_INDEX** only. Resolve: EQ trading_symbol → INDEX trading_symbol → INDEX name. Prefer EQ over BE. |
| **Rationale** | Official BOD source; no per-add search API; offline-friendly after cache. |
| **Consequences** | FO dropped after parse. CDN fail → empty cache, no crash; pinned seed keys still work. Validate gzip/JSON before replacing cache file. |

---

## 4. Market data & candle engine

### KD7 / KD23 — One long-lived Upstox streamer; dynamic subscribe/unsubscribe

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | Single `MarketDataStreamerV3` per process, **Mode.FULL**. Connect once with initial key set; **subscribe/unsubscribe** for add/remove. Local key set is source of truth on rebuild. |
| **Rationale** | SDK supports multi-key; one connection; reconnect restores SDK map if same instance kept. |
| **Consequences** | Never recreate streamer on every add. On subscribe failure, do not keep keys locally; on unsubscribe failure, restore local set. |

### AD2 — Index live ticks use `fullFeed.indexFF` (not `marketFF`)

| | |
|---|---|
| **Status** | Accepted (implemented 2026-07-10; volume stance confirmed 2026-07-15) |
| **Decision** | Parse **both** `fullFeed.marketFF` (equities) and **`fullFeed.indexFF`** (indices) in `UpstoxFeedClient.extractTick`. **Index volume stays 0** for product purposes (no futures proxy, no Nifty-50 constituent sum). |
| **Rationale** | Upstox V3 proto uses a oneof; indices do **not** populate `marketFF`. Without `indexFF`, NIFTY never received live ticks after seed and appeared ~15 minutes “delayed” (frozen at last REST bar). **This was our bug, not an Upstox free-plan delay.** |
| **Volume evidence (live)** | Index feed has **no equity `vtt`**. `indexFF.marketOHLC` may still arrive (e.g. `ohlcCount=2` with `1d` + `I1`) but **`vol` is 0** — observed for `NSE_INDEX\|Nifty 50`: `dayVol=0 i1Vol=0 source=I1 resolvedVtt=0`. Historical/intraday candle API also maps field index 5 as volume; for indices that field is typically **0**. We **do not invent** index volume from price. |
| **Consequences** | Index **price** charts update live like equities. Volume histogram / OHLC legend **Vol** on indices remain 0 (expected). Pattern volume confirmation already treats unusable index volume as close-only fallback. Optional `IndexVolumeSupport` only passes through non-zero OHLC vols if Upstox ever fills them — not a synthetic volume product. Alternatives (futures proxy, sum of 50 equities) explicitly **out of scope**. |
| **Code** | `UpstoxFeedClient.java`, `IndexVolumeSupport.java` (passthrough + first-tick INFO diagnostics) |

### KD12 — Sequential bootstrap (symbols × timeframes)

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | Startup and add: seed **sequentially** (no parallel historical fan-out). Supported TFs: `1m, 5m, 15m, 1h, 4h, 1d`. |
| **Rationale** | Protect Upstox historical/intraday rate limits. |
| **Consequences** | Cold start for 10 symbols × 6 TF is multi-second; log progress `i/N`. |

### KD11 — Per-symbol + global bootstrap status

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | Each entry: `PENDING | READY | FAILED | REMOVING`. Global READY if **≥1** symbol READY; FAILED only if **zero** READY. Per-symbol READY if **≥1** TF seeded with non-empty candles. |
| **Rationale** | Partial success is better than all-or-nothing; FE can show badges and still chart primary when others fail. |
| **Consequences** | Status endpoint remaps global READY → FAILED/PENDING when **primary** is failed/pending so chart UX stays honest. |

### KD21 — Candles HTTP matrix

| bootstrapStatus | GET candles |
|---|---|
| Not on watchlist | **404** |
| FAILED | **503** + error |
| PENDING | **200** `[]` |
| READY, TF missing/empty | **200** `[]` |
| READY with data | **200** candle list |

### KD10 / KD18 — Evict on remove; unbounded candles documented

| | |
|---|---|
| **Status** | Accepted (partially implemented) |
| **Decision** | On remove: unsubscribe feed, **`CandleEngine.evict`**, **broadcaster throttle eviction**, notify WS, hard-delete. Candle closed lists remain **unbounded** in v1; ring buffer is a follow-up. |
| **Rationale** | Isolation and leak prevention now; retention trim deferred. |

### KD24 — Market phase: prefer NSE_EQ, else NSE_INDEX

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | From feed `segmentStatus`: use **NSE_EQ** if present, else **NSE_INDEX**, else clock fallback. |
| **Rationale** | Equity session is product clock of record; index-only seed still needs INDEX phase. |

---

## 5. API surface

### KD8 — Watchlist + per-symbol routes primary; `/api/market/*` shim

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | Primary: `GET/POST/DELETE /api/watchlist`, `GET /api/symbols/{symbolId}/candles`. Keep `/api/market/symbol|status|candles` as **shim** over `findPrimary()`. |
| **Rationale** | Align with Data-Flow spec; preserve migration/compat. |

### KD16 — Blocking POST add

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | `POST /api/watchlist` **blocks** until seed finishes → **200** with final `READY` or `FAILED`. No async 202 in v1. |
| **Rationale** | One clear contract; historical seed cost is sequential anyway. |
| **Consequences** | Request can take tens of seconds. Bootstrap runs **outside** the capacity lock so DELETE can mark REMOVING mid-seed; unexpected throw marks FAILED (no zombie PENDING). |

### KD22 — Path encoding for instrument keys

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | Spring paths use `{symbolId:.+}`. Clients **must** `encodeURIComponent` for `|` and spaces. Shared FE helper `encodeSymbolId`. |
| **Rationale** | Keys like `NSE_INDEX|Nifty 50` break naive path segments. |

### KD17 — Empty watchlist allowed

| | |
|---|---|
| **Status** | Accepted |
| **Decision** | Watchlist may be empty after removes. Keep streamer idle (or connected with empty set policy as implemented). Always notify WS on remove. |

---

## 6. Frontend

### KD9 / KD25 — Thin switcher; watchlist is source of truth

| | |
|---|---|
| **Status** | Accepted (implemented); **UI shape superseded by AD8** for chrome layout |
| **Decision** | **No** sparkline tiles in v1. Load watchlist → pick primary → candles + WS for **active** symbol only. On switch: generation counter invalidates stale fetches; re-subscribe. Filter WS by **symbolId + timeframe**. Per-symbol FAILED banner; PENDING poll until READY/FAILED. |
| **Rationale** | Smallest E2E multi-symbol UI. |
| **Consequences** | Timeframe list may fall back to FE defaults if `/api/market/timeframes` is absent. |

### KD28 — UI WS ≠ full watchlist firehose

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | **Upstox → backend:** live ticks for **all** active watchlist symbols. **Backend → browser:** only the session’s subscribed `symbolId|timeframe`. |
| **Rationale** | Keep server hot for fast switch / future patterns; avoid flooding the browser. |

### AD8 — Right-side watchlist list + instrument combobox (add/remove UX)

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | Replace header free-text + “remove active only” with: (1) **right sidebar** vertical **list** of watchlist rows (click = select chart; **×** = remove that `symbolId`); (2) **typeahead** search to add. Search min **2** chars, debounce ~**250 ms**, limit **15**, already-listed rows shown **disabled** (“On list”). No confirm dialog on remove (v1). |
| **Rationale** | Users must not guess tickers; remove must not require switching first. Right rail keeps chart full-width. |
| **Consequences** | Design doc: `Watchlist-Add-Remove-UX-Design-v1.0.md`. Combobox dropdown must stay **within sidebar width** (no overflow past viewport). |

### AD9 — Instrument search API + optional add by `instrumentKey`

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | **`GET /api/instruments/search?q=&limit=`** over in-memory master (EQ + INDEX; BE skipped). Ranking: exact trading symbol → TS prefix → TS contains → display-name match. **`POST /api/watchlist`** body may include `instrumentKey` (wins when both set) or legacy `symbol` free-text. |
| **Rationale** | Autocomplete needs server-side search on master cache; picking a row should use authoritative key (avoids ambiguous symbols later). |
| **Consequences** | Soft supersedes KD19 for “never send key from client” when the key came from **our** search results. Free-text `symbol` remains supported. |

### AD10 — Chart UX: price scale reset + fixed bar spacing

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | On symbol/timeframe data apply: enable **autoScale** on the price scale and **scrollToRealTime**; do **not** use `fitContent` alone (sticky wrong zoom). Candlestick/bar **barSpacing = 7**. |
| **Rationale** | Switching symbols left users zoomed into a previous price range; tiny default bar spacing made candles hard to read. |

---

## 7. Market data seed, timeframes, live feed

### AD2 — Live index ticks from protobuf `indexFF` (not only `marketFF`)

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | `UpstoxFeedClient` must parse **`ff.indexFF`** for `NSE_INDEX` instruments. Equity full-feed is `marketFF`. Indices often have **volume = 0** — expected. |
| **Rationale** | Without `indexFF`, NIFTY (and other indices) appeared frozen after historical seed while equities stayed live. |
| **Consequences** | Validate lag on NIFTY 1m ≈ current minute after connect, same class as equities. |

### AD5 — Per-timeframe historical lookback + chunked Upstox history

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | Config `tip.market.historical-lookback-days` (default 30) and **`historical-lookback-days-by-timeframe`**: e.g. **1m:10, 5m:60, 15m:90, 1h:180, 4h:365, 1d:730** calendar days ending **yesterday**; **today** from intraday API. Multi-request **chunk** walk with merge/dedupe by timestamp. |
| **Rationale** | Hardcoded 5-day window only showed ~3 trading sessions; users need multi-week/month charts without single huge Upstox calls. |
| **Consequences** | Memory still acceptable at 10–50 symbols (KD18); full lookback appears only after process restart/re-seed. |

### AD6 — Upstox History V3 max range per unit (chunk limits)

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | Chunk days **must** respect Upstox V3 limits or seed returns **400 Bad Request** (`UDAPI1148`) and TF keeps only intraday: **minutes interval 1–15 → max 1 month/request**; **hours → max 1 quarter/request**; **days → decade**. Production chunks: **1m:4, 5m:20, 15m:28, 1h:90, 4h:90, 1d:365**. |
| **Rationale** | Earlier **15m chunk=45** and **4h chunk=180** failed history entirely → UI showed “current candle only” for those TFs. |
| **Consequences** | Longer lookbacks use more sequential requests; tests assert chunk caps (`MarketPropertiesChunkTest`). |

### AD7 — `TimeframeSpec.intervalMinutes()` for engine boundaries

| | |
|---|---|
| **Status** | Accepted (implemented) |
| **Decision** | Upstox path uses unit+interval (`hours`/`4`). Candle engine uses **`intervalMinutes()`**: 15m→15, 1h→60, **4h→240**, 1d→1440. `CandleBoundaryUtils` floors by **minutes-of-day** (not minute-of-hour alone) so multi-hour bars work. |
| **Rationale** | Using raw `interval()` for `4h` treated bars as **4-minute** live candles. |
| **Consequences** | Live close boundaries for 4h align with 240-minute buckets (calendar-day floor for ≥1d). |

### KD18 — Unbounded in-memory closed candles (ring buffer later)

| | |
|---|---|
| **Status** | Accepted (v1); ring buffer deferred |
| **Decision** | No max closed-candle eviction yet. Approximate heap for full lookbacks: ~15–25 MB candles @ 10 symbols; ~60–100 MB @ 50. Slow growth after seed (~MB/day class). |
| **Rationale** | Simpler engine; product cap 50 already bounds scale. |
| **Consequences** | Optional later: `max-closed-candles-per-state` drop oldest closed only. |

---

## 8. Security & config

### AD3 — Upstox access token via environment (not committed)

| | |
|---|---|
| **Status** | Accepted |
| **Decision** | Prefer `access-token: ${UPSTOX_ACCESS_TOKEN:}` (or Spring `TIP_UPSTOX_ACCESS_TOKEN` if bound as property). Do not commit live tokens. |
| **Rationale** | Tokens expire and are secrets. |
| **Consequences** | Local run requires env or local override. Blank token → bootstrap FAILED / seed skip. |

### AD11 — PowerShell `$env:` is session-only; User env is durable

| | |
|---|---|
| **Status** | Accepted (ops) |
| **Decision** | `$env:UPSTOX_ACCESS_TOKEN = "..."` lasts **one shell session**. Permanent: set **User** environment variable (e.g. `[Environment]::SetEnvironmentVariable(..., 'User')`) and open a **new** terminal. Child processes only inherit env present at start. |
| **Rationale** | Operators confused “permanent” vs session when restarting backend from another terminal. |

### AD4 — CORS for local Vite

| | |
|---|---|
| **Status** | Accepted |
| **Decision** | Allow origin `http://localhost:5173`; Vite proxies `/api` and `/ws` to backend. |

---

## 9. Divergences from earlier docs

| Earlier plan | Current decision |
|---|---|
| Postgres `watchlist_symbols` before multi-symbol engine | **In-memory first** (KD1) |
| Hard cap **10** | Hard cap **50**, soft-warn **40** (KD2) |
| Default / seed **RELIANCE** only | Seed **NIFTY 50 + 9 equities** (KD3) |
| Optional instrument search | **Required** local master cache (KD6) + **search API** (AD9) |
| Full watchlist tiles | **Thin switcher** then **right list** (KD9 → AD8) |
| Postgres remove = hard or unspecified | Postgres **soft-delete** later (KD27) |
| Client never sends instrument_key | Free-text **or** key from search (AD9) |
| 5 calendar days history | **Per-TF lookback** + Upstox-safe chunks (AD5, AD6) |
| Live indices via marketFF only | **indexFF** required (AD2) |

When older docs conflict, **this file + multi-symbol design rev 5 + Watchlist UX design** win for multi-symbol / UI behavior.

---

## 10. Explicit non-goals (current phase)

1. Order execution / trading.
2. Postgres / Flyway (interface only; soft-delete design recorded).
3. Multi-user auth / per-user watchlists.
4. BSE, FO trading, multi-exchange disambiguation UI.
5. Pattern detectors, alerts, ATR journal (later phases).
6. Client-side TF resampling; multi-chart layouts.
7. Candle ring-buffer / closed-candle TTL (follow-up KD18).
8. Async add (202 + poll) — deferred after blocking POST (KD16).
9. Confirm dialog on watchlist remove (may add later for last-symbol only).
10. Dump entire instrument master to the browser (search API only).

---

## 11. Implementation notes worth preserving

| Topic | Note |
|---|---|
| **Seed order** | List order in `application.yml` = insertion order = primary. |
| **Spring map keys with spaces** | Use bracket form: `"[Nifty 50]": "NSE_INDEX\|Nifty 50"`. |
| **Add concurrency** | Short `addCapacityLock` for hard-max; bootstrap unlocked; per-symbol lock for lifecycle. |
| **Empty TF seed** | Empty historical+intraday does **not** count as successful TF → symbol FAILED if all empty. |
| **Partial TF seed** | If history fails for one TF but intraday returns bars, TF may still “succeed” with thin data — prefer fixing chunk limits (AD6) over silent thin charts. |
| **Historical lookback** | Config `tip.market.historical-lookback-days` + per-TF map; today = intraday endpoint. |
| **Upstox history ranges** | 15m ≤1 month/req; hours ≤1 quarter/req (AD6). |
| **interval vs intervalMinutes** | SDK path uses unit+interval; engine uses minutes (AD7). |
| **Health** | `GET /api/health` (not `/health`). |
| **Index volume** | **Keep at 0** (product decision). Upstox index OHLC `vol` / candle field 5 are typically 0; do not invent volume. Futures proxy / constituent-sum = out of scope. |
| **Validate index live** | NIFTY 1m lag should match equities (~current minute), not freeze after seed. First-tick log: `Index volume first tick: … dayVol= i1Vol= source= resolvedVtt=`. |
| **Instrument search** | `GET /api/instruments/search`; POST add prefers `instrumentKey` from hit. |
| **Watchlist UI** | Right sidebar list + combobox; header keeps TF + chart type only. |
| **Port 8080** | Only one Spring Boot instance; second start fails with bind error. |

---

## 12. Decision index (quick lookup)

| ID | One-line |
|---|---|
| AD0 | Read-only platform, no execution |
| AD1 | Spring Boot + React/Vite + Upstox Java SDK |
| AD2 | Parse **indexFF** for live indices; **index volume stays 0** |
| AD3 | Token via env (not committed) |
| AD4 | Local CORS / Vite proxy |
| AD5 | Per-TF historical lookback + chunked fetch |
| AD6 | Upstox max range → chunk days (15m≤28, 4h≤90) |
| AD7 | `intervalMinutes()` for engine / 4h=240 |
| AD8 | Right-side list + combobox add/remove UX |
| AD9 | Instrument search API + POST by instrumentKey |
| AD10 | Chart autoScale + barSpacing=7 |
| AD11 | `$env:` session-only; User env durable |
| KD1 | In-memory watchlist first; Postgres later |
| KD2 | Cap 50 / soft-warn 40 |
| KD3 | Seed NIFTY 50 + 9 equities |
| KD4 | symbolId = instrument_key |
| KD5 | Add by trading symbol (compat) |
| KD6 | NSE master cache EQ+INDEX |
| KD7 | Single multi-key streamer |
| KD8 | Watchlist/symbol APIs + market shim |
| KD9 | Thin FE switcher (evolved by AD8) |
| KD10 | Evict engine + throttle on remove |
| KD11 | Per-symbol + global bootstrap status |
| KD12 | Sequential seed |
| KD13 | Primary = insertion order |
| KD14 | Defaults / primary = NIFTY for chart continuity |
| KD15 | Config seed list + pinned keys |
| KD16 | Blocking POST add |
| KD17 | Empty watchlist OK |
| KD18 | Unbounded candles; ring buffer later |
| KD19 | Softened by AD9 when key from search |
| KD20 | Sync ApplicationRunner bootstrap |
| KD21 | Candles HTTP matrix |
| KD22 | Path encoding for keys |
| KD23 | Streamer lifecycle invariants |
| KD24 | Phase: EQ then INDEX |
| KD25 | FE watchlist SSoT + WS filter |
| KD26 | REMOVING visibility |
| KD27 | Soft-delete Postgres later |
| KD28 | Full feed to server; filtered WS to UI |

---

## 13. References

- Design: `Multi-Symbol-Watchlist-Design-v1.0.md`
- Watchlist UX: `Watchlist-Add-Remove-UX-Design-v1.0.md`
- Architecture overview: `Architecture-Design-v1.0.md`
- API / data flow: `Data-Flow-and-Frontend-API-Spec-v1.0.md`
- Upstox instruments: https://upstox.com/developer/api-documentation/instruments/
- Upstox Market Data Feed V3: https://upstox.com/developer/api-documentation/v3/get-market-data-feed/
- Upstox Historical Candle V3 (range limits): https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/
- Proto (index vs equity full feed): `backend/src/main/proto/MarketDataFeed.proto` (`marketFF` / `indexFF`)

---

*Last updated: 2026-07-10 — multi-symbol delivery + NIFTY `indexFF` live-tick fix.*

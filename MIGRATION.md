# TIP-2 Migration Plan — Java → Python 3 Backend

| Field | Value |
|---|---|
| **Document** | Migration plan + validation matrix |
| **Status** | **IMPLEMENTED** — FastAPI backend with full pattern suite, feed, journal, auth (2026-07-22) |
| **Source** | `../TIP` (Java Spring Boot 3.3 / Java 17) |
| **Target** | `TIP-2` (Python 3 backend; frontend + HTTP/WS contracts unchanged) |
| **Non-goals** | Frontend rewrite; API path/shape changes; order execution |

---

## 1. Goals and constraints

### 1.1 Goals

1. Replace the Java backend with a **Python 3** backend that is **API-compatible** with the existing React frontend.
2. Keep **all public REST paths**, status codes, cookie/session auth behavior, and **WebSocket** message shapes the same so the frontend needs **no logic changes**.
3. Preserve product behavior: multi-symbol watchlist, IST candle engine, Upstox V3 live feed, pattern intelligence, journal, admin users.
4. Port the Java unit/integration **test intent** into Python tests so parity is measurable.

### 1.2 Hard constraints (do not break)

| Constraint | Detail |
|---|---|
| Frontend | Unchanged under `frontend/` (Vite proxies `/api` and `/ws` → `:8080`) |
| Listen port | `8080` (or same proxy target if changed later in both places) |
| REST base | `/api/*` |
| Live WS | `/ws/live` |
| Candle times | Real **UTC epoch seconds**, IST-aligned boundaries |
| Symbol IDs | Upstox instrument keys (`NSE_EQ\|…`, `NSE_INDEX\|Nifty 50`) |
| Session auth | Cookie session + credentials; `401`/`403` semantics |
| Security matrix | See §4.3 — ADMIN-only watchlist mutate; `/ws/**` open today |
| DB schema | Same Flyway SQL under `backend/db/migration/` (V1–V5) until a deliberate schema change |

### 1.3 What was moved into TIP-2 (scaffold)

| Path | Source | Role |
|---|---|---|
| `frontend/` | TIP frontend (no `node_modules`/`dist`) | Unchanged UI |
| `docs/` | TIP domain docs | Pattern/indicator product rules |
| Root design `*.md` | TIP design docs | Architecture + API history |
| `backend/db/migration/` | Java Flyway SQL | Schema parity |
| `backend/proto/MarketDataFeed.proto` | Upstox V3 proto | Python protobuf codegen |
| `backend/reference/java-config/` | `application.yml` (+ memory) | Config parity checklist |
| `backend/reference/java-tests/` | All 51 Java test classes | Porting source of truth |
| `backend/reference/java-test-resources/` | Test fixtures | e.g. NSE seed fixture |
| `.env.example`, `.gitignore` | TIP | Env conventions |
| `contracts/API-CONTRACT.md` | New | Frozen HTTP/WS contract |
| `MIGRATION.md` | This file | Plan + validation |
| `backend/app/`, `backend/tests/` | Python FastAPI implementation | Core P0–P10 in place; expand pattern parity tests |

**Java remains in `../TIP` as the live reference implementation until cutover.**

---

## 2. Target architecture (Python)

### 2.1 Recommended stack

| Concern | Choice | Rationale |
|---|---|---|
| HTTP + OpenAPI | **FastAPI** | Async-friendly, clear routing, easy parity tests |
| ASGI server | **Uvicorn** (single worker for v1) | In-memory candle/watchlist state is process-local |
| WebSocket | Starlette/FastAPI WS | `/ws/live` |
| Config | **pydantic-settings** + YAML/env | Mirror `tip.*` and Spring env overrides |
| DB | **SQLAlchemy 2** + **Alembic** *or* run existing SQL as-is | Prefer applying Flyway SQL V1–V5 unchanged first |
| Auth | Session cookie (e.g. itsdangerous/starlette SessionMiddleware) + bcrypt | Match Spring session cookie flow for Vite proxy |
| HTTP client (Upstox REST) | `httpx` | Historical/intraday candles, authorize feed |
| Live feed | `websockets` / `httpx` WS + **protobuf** from `MarketDataFeed.proto` | Replace `MarketDataStreamerV3` |
| Optional SDK | `upstox-python-sdk` for REST if stable | Still implement V3 feed decode yourself if SDK incomplete |
| Tests | **pytest** + **pytest-asyncio** + httpx `ASGITransport` | Port of Java tests |
| Logging | `structlog` or stdlib logging | Quiet per-tick; INFO on reliability paths |

### 2.2 Package layout (to implement later)

```
backend/
  app/
    main.py                 # FastAPI app, lifespan bootstrap
    config.py               # tip.* settings (from reference yml)
    api/
      health.py
      auth.py
      admin_users.py
      market.py
      instruments.py
      watchlist.py
      symbols.py            # candles + patterns + per-symbol stats
      pattern_statistics.py
      websocket/
        live.py
        broadcasters.py
    market/
      candle_engine.py
      candle_boundary.py
      timeframe.py
      nse_clock.py
      bootstrap.py
      seed_merger.py
      upstox_provider.py
      upstox_feed.py
      events.py
    indicators/
    instrument/
    patterns/               # breakout, breakdown, pinbar, …
    journal/
    watchlist/
    user/
  db/migration/             # V1–V5 SQL (copied)
  proto/MarketDataFeed.proto
  tests/                    # pytest mirrors of java-tests
  reference/                # read-only Java artifacts
  requirements.txt          # added at implementation
  pyproject.toml            # optional
```

### 2.3 Runtime model (critical)

- **One process, one worker** for MVP parity (mirrors single Spring Boot process).
- One long-lived Upstox feed connection; **subscribe/unsubscribe** without reconnect-per-add (KD23).
- Candle state: dict + **per-symbol lock** (threading or asyncio.Lock with a clear rule).
- Prefer: asyncio loop for HTTP/WS; run blocking Upstox protobuf callbacks via a thread that posts ticks onto the loop (`call_soon_threadsafe`).
- Do **not** enable multiple Uvicorn workers without externalizing candle state.

### 2.4 Implementation phases (execute only after “go”)

| Phase | Deliverable | Exit criteria |
|---|---|---|
| **P0** | Repo scaffolding, settings load, `/api/health` | Health returns 200 on :8080 |
| **P1** | Config + memory watchlist seed (10 symbols) | `GET /api/watchlist` shape matches FE |
| **P2** | Candle engine + boundaries + timeframes (no Upstox) | Unit tests from Java candle suite pass |
| **P3** | Upstox REST historical/intraday + bootstrap seed | Seeded candles for primary symbol |
| **P4** | Upstox V3 Protobuf live feed + tick → candles | Live `candle_update` on WS |
| **P5** | Frontend `/ws/live` broadcaster (throttle 1s) | Chart updates without FE changes |
| **P6** | Auth/session + admin users + security matrix | Login cookie works through Vite proxy |
| **P7** | Postgres watchlist + Flyway SQL apply | Store=postgres parity |
| **P8** | Indicators + all pattern detectors/lifecycles | Pattern unit tests green |
| **P9** | Pattern journal + REST patterns/statistics | Journal + stats API parity |
| **P10** | Market status, phase clock, reconcilers | Status + session expiry behavior |
| **P11** | Full regression matrix (§6–7) + cutover checklist | Signed off for dual-run / switch |

Suggested order for risk: **P2 → P4 spike early** (feed de-risk), then finish API surface.

---

## 3. Module mapping (Java → Python)

| Java package / class | Python target | Notes |
|---|---|---|
| `TradingIntelligencePlatformApplication` | `app/main.py` lifespan | Bootstrap order |
| `HealthController` | `api/health.py` | `GET /api/health` |
| `AuthController` | `api/auth.py` | login/logout/me |
| `AdminUserController` | `api/admin_users.py` | ADMIN role |
| `MarketController` | `api/market.py` | timeframes, symbol, status, candles shim |
| `SymbolController` | `api/symbols.py` | `/{symbolId}/candles` |
| `WatchlistController` | `api/watchlist.py` | list/add/delete |
| `InstrumentController` | `api/instruments.py` | search |
| `PatternController` | `api/symbols.py` | patterns + statistics |
| `PatternStatisticsController` | `api/pattern_statistics.py` | bulk stats |
| `LiveWebSocketHandler` | `api/websocket/live.py` | subscribe protocol |
| `LiveCandleBroadcaster` | `api/websocket/broadcasters.py` | throttle |
| `MarketStatusBroadcaster` | same | phase messages |
| `CandleEngine` | `market/candle_engine.py` | vtt delta, events |
| `CandleBoundaryUtils` | `market/candle_boundary.py` | Asia/Kolkata |
| `UpstoxFeedClient` | `market/upstox_feed.py` | **highest risk** |
| `UpstoxMarketDataProvider` | `market/upstox_provider.py` | REST candles |
| `MarketBootstrapService` | `market/bootstrap.py` | sequential seed |
| `NseMarketClock` / phase | `market/nse_clock.py` | holidays, phases |
| Indicators | `indicators/*` | ATR, Donchian, Vol SMA |
| Pattern detectors | `patterns/*` | pure logic port |
| `PostgresPatternJournal` | `journal/*` | SQLAlchemy |
| `WatchlistService` + repos | `watchlist/*` | memory + postgres |
| `UserService` + security | `user/*` + middleware | bcrypt, roles |
| `SecurityConfig` | middleware + deps | §4.3 |
| Flyway V1–V5 | `db/migration/` | apply on startup or Alembic wrapper |

---

## 4. Frozen API contract summary

Full detail: [`contracts/API-CONTRACT.md`](contracts/API-CONTRACT.md).  
Product narrative: [`Data-Flow-and-Frontend-API-Spec-v1.0.md`](Data-Flow-and-Frontend-API-Spec-v1.0.md).

### 4.1 REST endpoints (must match)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | public | Liveness |
| POST | `/api/auth/login` | public | Session cookie |
| POST | `/api/auth/logout` | public | |
| GET | `/api/auth/me` | authenticated (or 401) | FE uses allow-401 |
| GET | `/api/admin/users` | ADMIN | |
| GET | `/api/admin/users/{id}` | ADMIN | |
| POST | `/api/admin/users` | ADMIN | |
| PUT | `/api/admin/users/{id}` | ADMIN | |
| POST | `/api/admin/users/{id}/password` | ADMIN | |
| POST | `/api/admin/users/{id}/seed-cash` | ADMIN | |
| POST | `/api/admin/users/{id}/reset` | ADMIN | |
| POST | `/api/admin/users/{id}/trading` | ADMIN | |
| GET | `/api/market/timeframes` | authenticated* | |
| GET | `/api/market/symbol` | authenticated* | primary / default |
| GET | `/api/market/status` | authenticated* | phase, bootstrap, feed |
| GET | `/api/market/candles` | authenticated* | primary shim |
| GET | `/api/symbols/{symbolId}/candles` | authenticated* | encode `\|` and spaces |
| GET | `/api/symbols/{symbolId}/patterns` | authenticated* | |
| GET | `/api/symbols/{symbolId}/statistics` | authenticated* | min sample gating |
| GET | `/api/pattern-statistics` | authenticated* | bulk ranking |
| GET | `/api/watchlist` | authenticated* | public-active only |
| POST | `/api/watchlist` | **ADMIN** | body symbol and/or instrumentKey |
| DELETE | `/api/watchlist/{symbolId}` | **ADMIN** | 204 |
| GET | `/api/instruments/search` | authenticated* | |

\* `memory` profile: all open (Java `@Profile("memory")`).

### 4.2 WebSocket

| Item | Contract |
|---|---|
| URL | `/ws/live` |
| Client → server | `{ "type": "subscribe", "symbolId": "…", "timeframe": "5m" }` |
| Ack | `{ "type": "subscribed", "symbolId", "timeframe" }` |
| Candle | `{ "type": "candle_update" \| …, "symbolId", "timeframe", "candle": {time,open,high,low,close,volume}, "isFinal" }` |
| Pattern | `{ "type": "pattern_event", … }` (stages per config) |
| Errors | JSON error message shape compatible with current handler |
| Auth | Currently **permitAll** on `/ws/**` (do not tighten without FE work) |

### 4.3 Security parity

| Rule | Behavior |
|---|---|
| CSRF | Disabled |
| CORS | `http://localhost:5173`, credentials allowed |
| Unauthenticated API | `401` |
| Forbidden | `403` |
| Watchlist POST/DELETE | ADMIN only |
| Admin routes | ADMIN only |
| Password | bcrypt |

---

## 5. Config parity checklist

Source of truth for values: `backend/reference/java-config/application.yml`.

Must re-home under Python settings (env overrides where noted):

- `UPSTOX_ACCESS_TOKEN`
- `server.port` → 8080
- Datasource URL/user/password (Postgres)
- `tip.market.*` (timeframes, throttle, lookbacks, live-feed-enabled)
- `tip.pattern.*` (all detector knobs, expiry, ws broadcast stages)
- `tip.watchlist.*` (store memory|postgres, seeds, hard-max 50)
- `tip.instruments.*` (master URL, cache dir)
- `tip.cors.allowed-origins`
- `tip.users.*` (seed cash, admin user/password)
- `TIP_WATCHLIST_STORE` / memory profile equivalent
- `TIP_ADMIN_PASSWORD`

---

## 6. Validation matrix — unit / component tests

Java sources live under `backend/reference/java-tests/`.  
Each row **must** have a Python equivalent before claiming parity for that module.

### 6.1 Application / config

| # | Java test | Python target (planned) | Intent |
|---|---|---|---|
| T01 | `TradingIntelligencePlatformApplicationTests` | `tests/test_app_loads.py` | App boots |
| T02 | `MarketPropertiesChunkTest` | `tests/config/test_market_properties.py` | Lookback / chunk binding |
| T03 | `PatternPropertiesTimeframeTest` | `tests/config/test_pattern_properties.py` | TF enable flags |
| T04 | `WatchlistPropertiesBindingTest` | `tests/config/test_watchlist_properties.py` | Seeds, caps, keys |

### 6.2 Market / candles / feed

| # | Java test | Python target (planned) | Intent |
|---|---|---|---|
| T10 | `CandleBoundaryUtilsTest` | `tests/market/test_candle_boundary.py` | IST floor/ceil |
| T11 | `TimeframeParserTest` | `tests/market/test_timeframe_parser.py` | `5m` → minutes |
| T12 | `CandleEngineTest` | `tests/market/test_candle_engine.py` | Tick→OHLCV, vtt delta |
| T13 | `CandleEngineCloseStaleTest` | `tests/market/test_candle_engine_stale.py` | Stale close |
| T14 | `MarketSeedMergerTest` | `tests/market/test_seed_merger.py` | Dedup epochs |
| T15 | `MarketBootstrapServiceTest` | `tests/market/test_bootstrap.py` | Recovery order |
| T16 | `MarketStatusServiceTest` | `tests/market/test_market_status.py` | Status fields |
| T17 | `MarketPhaseClockReconcilerTest` | `tests/market/test_phase_reconciler.py` | Phase without feed |
| T18 | `NseMarketClockTest` | `tests/market/test_nse_clock.py` | Session times |
| T19 | `NseMarketClockPhaseTest` | `tests/market/test_nse_clock_phase.py` | Phase enum |
| T20 | `IndexVolumeSupportTest` | `tests/market/test_index_volume.py` | Index vol passthrough |
| T21 | `UpstoxFeedClientTest` | `tests/market/test_upstox_feed_client.py` | Subscribe lifecycle |
| T22 | `UpstoxFeedClientExtractTickTest` | `tests/market/test_upstox_extract_tick.py` | marketFF vs indexFF |

### 6.3 Indicators

| # | Java test | Python target (planned) | Intent |
|---|---|---|---|
| T30 | `AtrIndicatorTest` | `tests/indicators/test_atr.py` | ATR(14) |
| T31 | `DonchianIndicatorTest` | `tests/indicators/test_donchian.py` | Donchian(20) |

### 6.4 Instruments / watchlist / users

| # | Java test | Python target (planned) | Intent |
|---|---|---|---|
| T40 | `InstrumentMasterCacheTest` | `tests/instrument/test_master_cache.py` | GZ master index |
| T41 | `InMemoryWatchlistRepositoryTest` | `tests/watchlist/test_memory_repo.py` | Order, REMOVING, cap |
| T42 | `PostgresWatchlistRepositoryTest` | `tests/watchlist/test_postgres_repo.py` | Soft-delete later / active |
| T43 | `WatchlistServiceTest` | `tests/watchlist/test_service.py` | Add/remove rules |
| T44 | `WatchlistServiceEnsureSeededTest` | `tests/watchlist/test_seed.py` | 10-seed startup |
| T45 | `MemoryStoreContextLoadTest` | `tests/watchlist/test_memory_profile.py` | No-DB boot |
| T46 | `UserServiceTest` | `tests/user/test_user_service.py` | Users, cash, roles |

### 6.5 Patterns

| # | Java test | Python target (planned) | Intent |
|---|---|---|---|
| T50 | `BreakoutBarEvaluatorTest` | `tests/patterns/breakout/test_bar_eval.py` | |
| T51 | `BreakoutDetectorTest` | `tests/patterns/breakout/test_detector.py` | |
| T52 | `BreakoutLifecycleTest` | `tests/patterns/breakout/test_lifecycle.py` | |
| T53 | `BreakdownBarEvaluatorTest` | `tests/patterns/breakdown/test_bar_eval.py` | |
| T54 | `BreakdownDetectorTest` | `tests/patterns/breakdown/test_detector.py` | |
| T55 | `BreakdownLifecycleTest` | `tests/patterns/breakdown/test_lifecycle.py` | |
| T56 | `ConsolidationDetectorTest` | `tests/patterns/consolidation/test_detector.py` | |
| T57 | `ConsolidationLifecycleTest` | `tests/patterns/consolidation/test_lifecycle.py` | |
| T58 | `EngulfingDetectorTest` | `tests/patterns/engulfing/test_detector.py` | |
| T59 | `InsideBarDetectorTest` | `tests/patterns/insidebar/test_detector.py` | |
| T60 | `InsideBarDelayedBreakTest` | `tests/patterns/insidebar/test_delayed_break.py` | |
| T61 | `PinBarDetectorTest` | `tests/patterns/pinbar/test_detector.py` | |
| T62 | `PinBarGeometryTest` | `tests/patterns/pinbar/test_geometry.py` | |
| T63 | `PinBarLifecycleTest` | `tests/patterns/pinbar/test_lifecycle.py` | |
| T64 | `StructureDetectorTest` | `tests/patterns/structure/test_detector.py` | |
| T65 | `StructureStopSanitizeTest` | `tests/patterns/structure/test_stop_sanitize.py` | |
| T66 | `SwingPointsTest` | `tests/patterns/structure/test_swing_points.py` | |
| T67 | `VolumeBreakoutDetectorTest` | `tests/patterns/volumebreakout/test_detector.py` | |
| T68 | `WatchlistRemovePatternListenerTest` | `tests/patterns/test_watchlist_remove.py` | Cancel on remove |

### 6.6 HTTP / WebSocket API tests

| # | Java test | Python target (planned) | Intent |
|---|---|---|---|
| T70 | `MarketControllerTest` | `tests/api/test_market_controller.py` | status/candles/symbol |
| T71 | `SymbolControllerTest` | `tests/api/test_symbol_controller.py` | path encoding |
| T72 | `WatchlistControllerTest` | `tests/api/test_watchlist_controller.py` | 200/404/409/204 |
| T73 | `InstrumentControllerTest` | `tests/api/test_instruments.py` | search |
| T74 | `PatternControllerTest` | `tests/api/test_pattern_controller.py` | patterns/stats |
| T75 | `PatternStatisticsControllerTest` | `tests/api/test_pattern_statistics.py` | bulk |
| T76 | `LiveCandleBroadcasterTest` | `tests/api/test_live_broadcaster.py` | throttle / fan-out |

**Total Java tests to port: 51 classes → T01–T76 matrix (some multi-case).**

### 6.7 Frontend tests (unchanged; run against either backend)

From TIP frontend (copied):

| Command | Purpose |
|---|---|
| `cd frontend && npm test` | Vitest: `http`, pattern statistics client, etc. |
| `npm run build` | Typecheck/build still green |

---

## 7. Integration / manual validation (cutover gate)

Run after automated suite is green. Compare **TIP (Java)** vs **TIP-2 (Python)** side-by-side when possible.

### 7.1 Smoke (any profile)

| ID | Check | Pass criteria |
|---|---|---|
| M01 | `GET /api/health` | 200 |
| M02 | Frontend `npm run dev` + proxy | No CORS errors; API reachable |
| M03 | Login admin | Cookie set; `GET /api/auth/me` returns user |
| M04 | Logout | Subsequent `/api/auth/me` unauthenticated |
| M05 | Non-admin cannot POST watchlist | 403 |
| M06 | Admin list watchlist | Ordered; bootstrap statuses present |
| M07 | Chart load primary | Candles array non-empty (market hours or seeded history) |
| M08 | WS subscribe | `subscribed` ack; `candle_update` during live session |
| M09 | Timeframe switch | Re-fetch + resubscribe; no client-side resample bugs |
| M10 | Index symbol (NIFTY) | Live price updates (indexFF path); volume may be 0 |

### 7.2 Watchlist

| ID | Check | Pass criteria |
|---|---|---|
| M20 | Add known equity by symbol | 200 READY/FAILED terminal; appears in list |
| M21 | Duplicate add | 409 |
| M22 | Unknown symbol | 404 |
| M23 | Remove | 204; gone from public list; feed unsub |
| M24 | Hard max 50 | 409 at cap |
| M25 | Restart memory profile | Only seeds remain |
| M26 | Restart postgres profile | User adds persist |

### 7.3 Market data correctness

| ID | Check | Pass criteria |
|---|---|---|
| M30 | Candle times | Epoch seconds; chart IST shift still correct in FE |
| M31 | Volume equities | Per-bar volume from vtt delta, not cumulative dump |
| M32 | Multi-TF seed | 1m/5m/15m/1h/4h/1d bootstrap completes |
| M33 | Market phase | Open/close transitions without relying only on ticks |
| M34 | Feed reconnect | Resubscribe local key set; no duplicate streamer chaos |

### 7.4 Patterns / journal

| ID | Check | Pass criteria |
|---|---|---|
| M40 | Pattern REST | Instances shape matches FE overlays |
| M41 | Stats gating | Below `stats-min-sample-size` → insufficient_history |
| M42 | WS pattern_event | Stages in broadcast list only |
| M43 | Remove symbol | Active patterns cleaned (listener) |
| M44 | Session expiry | Intraday TFs expire at session close per config |

### 7.5 Admin / paper cash

| ID | Check | Pass criteria |
|---|---|---|
| M50 | Create user | Defaults seed cash |
| M51 | Set password / seed-cash / reset / trading | Field updates match Java |

### 7.6 Regression command checklist (implementation phase)

```text
# Backend (planned)
cd backend
python -m pytest -q

# Frontend (unchanged)
cd frontend
npm ci
npm test
npm run build

# Optional dual-run
# Terminal A: Java TIP on 8080  OR  Python TIP-2 on 8080
# Terminal B: frontend Vite 5173
```

---

## 8. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Upstox V3 Protobuf / indexFF vs marketFF | Silent wrong/frozen prices | Early P4 spike; port `ExtractTick` tests first; compare raw ticks to Java logs |
| Session cookies via Vite proxy | Login “works” in curl but not browser | Match cookie path/SameSite; keep credentials:include |
| Multi-worker ASGI | Split brain candles | Document single worker; refuse multi-worker in README |
| Float OHLC drift | Pattern false diffs | Use same rounding discipline as Java DTOs; compare fixtures |
| Timezone bugs | Wrong bar boundaries | Port `CandleBoundaryUtilsTest` before live feed |
| Incomplete security | Open admin in prod | Explicit security tests for 401/403 matrix |
| Schema drift | Journal/watchlist break | Apply same V1–V5 SQL; no silent Hibernate magic |

---

## 9. Cutover strategy

1. Develop TIP-2 backend until §6 automated + §7 manual gates pass.
2. Dual-run: same `UPSTOX_ACCESS_TOKEN`, separate DB name if needed (`tip2`).
3. Point Vite proxy at Python (or run Python on 8080 and stop Java).
4. Keep `../TIP` tagged/branch as rollback for at least one full trading session.
5. Only after a live market session validates M08–M34, mark Java backend deprecated.

**Rollback:** stop Python; start Java TIP; frontend unchanged.

---

## 10. Implementation trigger

> Implementation started. Run memory profile: `TIP_WATCHLIST_STORE=memory uvicorn app.main:app --port 8080` from `backend/`.

Continue expanding §6 test matrix and remaining pattern detectors (engulfing, inside-bar, structure, consolidation, volume-breakout) to full Java parity.

### Owner sign-off (fill when ready)

| Gate | Owner | Date | Result |
|---|---|---|---|
| Plan approved | | | |
| Implementation start | | | |
| Unit matrix complete | | | |
| Manual matrix complete | | | |
| Production cutover | | | |

---

## 11. Related documents in TIP-2

| Document | Use |
|---|---|
| [`contracts/API-CONTRACT.md`](contracts/API-CONTRACT.md) | Frozen endpoint list for implementers |
| [`Data-Flow-and-Frontend-API-Spec-v1.0.md`](Data-Flow-and-Frontend-API-Spec-v1.0.md) | Data flow + WS payloads |
| [`Architectural-Decisions.md`](Architectural-Decisions.md) | KD/AD decisions to preserve |
| [`Architecture-Design-v1.0.md`](Architecture-Design-v1.0.md) | System overview |
| [`docs/patterns/*`](docs/patterns/) | Detector product rules |
| [`backend/reference/java-tests/`](backend/reference/java-tests/) | Behavioral oracle |
| [`backend/reference/java-config/application.yml`](backend/reference/java-config/application.yml) | Config oracle |

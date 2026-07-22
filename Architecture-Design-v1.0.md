# Trading Intelligence Platform — Architecture Design (v1.0)

Status: **MVP1 complete** (July 2026). This document captures what is built today, key design decisions, and how future features should extend the system without rework.

Related documents:
- `Implementation-Plan-v1.0.md` — phased build plan (original Node/Postgres vision; see §8 for divergence)
- `Data-Flow-and-Frontend-API-Spec-v1.0.md` — broker → backend → frontend data contracts
- `Pattern-Definitions-v1.0-Final.md` — pattern detector rules for MVP2+

---

## 1. System overview

TIP is a **read-only** trading intelligence platform for NSE equities. It ingests live and historical market data from Upstox, builds exchange-aligned candles server-side, and streams them to a React chart UI. Future phases add watchlists, pattern detection, alerts, and persistence — but **no order execution**.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Browser (React + Vite)                        │
│  ChartContainer · marketApi · liveSocket · utcToNseChartTime (IST)      │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ REST /api/market/*  +  WS /ws/live
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Spring Boot Backend (Java 17)                        │
│                                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐    │
│  │ MarketController│  │ LiveWebSocket │   │ MarketStatusService    │    │
│  │ (REST API)   │   │ Handler       │   │ NseMarketClock         │    │
│  └──────┬───────┘   └──────┬───────┘   └──────────────────────────┘    │
│         │                  │                                            │
│         ▼                  ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      CandleEngine (in-memory)                    │   │
│  │  IST-aligned boundaries · volume from vtt delta · Spring events  │   │
│  └──────────────────────────────┬──────────────────────────────────┘   │
│                                 │                                       │
│  ┌──────────────────────────────▼──────────────────────────────────┐   │
│  │              MarketDataProvider (interface)                        │   │
│  │              └── UpstoxMarketDataProvider                          │   │
│  │                    ├── REST: historical + intraday candles         │   │
│  │                    └── UpstoxFeedClient: WebSocket V3 (Protobuf)   │   │
│  └──────────────────────────────┬──────────────────────────────────┘   │
└─────────────────────────────────┼───────────────────────────────────────┘
                                  ▼
                         Upstox Market Data APIs
```

---

## 2. Technology stack (as built)

| Layer | Choice | Notes |
|---|---|---|
| Backend runtime | Java 17, Spring Boot 3.3 | Chosen over original Node/Fastify plan for Upstox Java SDK |
| Market data broker | Upstox V3 | `MarketDataStreamerV3`, `mode: full` for cumulative volume (`vtt`) |
| Event bus | Spring `ApplicationEventPublisher` | In-process; no external queue at MVP scale |
| Candle storage | In-memory `ConcurrentHashMap` | No database yet |
| Frontend | React 19 + Vite 8 | Proxies `/api` and `/ws` to backend |
| Charting | Lightweight Charts v5 | Candlestick + line toggle from same OHLC data |
| Timezone | `Asia/Kolkata` (IST) | Backend: candle boundaries; frontend: display shift (§6) |

---

## 3. Backend package layout

```
com.tip
├── TradingIntelligencePlatformApplication
├── controller/
│   └── HealthController                    GET /health
├── config/
│   ├── CorsProperties, WebConfig
│   ├── UpstoxProperties, UpstoxClientConfig
│   ├── MarketProperties
│   └── WebSocketConfig                   /ws/live
├── api/
│   ├── MarketController                  GET /api/market/*
│   ├── dto/                              CandleDto, SymbolInfoResponse, ...
│   └── websocket/
│       ├── LiveWebSocketHandler
│       ├── LiveCandleBroadcaster         listens to CandleUpdated/Closed
│       └── MarketStatusBroadcaster       listens to MarketPhaseChanged
└── market/
    ├── MarketDataProvider                abstraction over broker
    ├── UpstoxMarketDataProvider
    ├── UpstoxFeedClient                  Protobuf tick stream
    ├── UpstoxCandleMapper                ISO timestamps → epoch seconds
    ├── MarketBootstrapService            session recovery on startup
    ├── MarketSeedMerger                  intraday + historical dedup
    ├── CandleEngine                      tick → candle aggregation
    ├── CandleBoundaryUtils               IST floor/ceil for bar starts
    ├── TimeframeParser                     "5m" → interval minutes
    ├── NseMarketClock / MarketPhase
    ├── MarketStatusService
    └── event/
        ├── CandleUpdatedEvent
        ├── CandleClosedEvent
        └── MarketPhaseChangedEvent
```

**Extension rule:** new broker = new `MarketDataProvider` implementation. Nothing above `market/` should import Upstox types directly.

---

## 4. Frontend layout

```
frontend/src/
├── App.jsx
├── components/
│   ├── ChartContainer.jsx     chart lifecycle, candle Map, WS handler
│   ├── ChartTypeToggle.jsx    candlestick ↔ line
│   └── ConnectionStatus.jsx   live / closed / error badges
├── services/
│   ├── marketApi.js           fetchSymbol, fetchCandles, fetchMarketStatus
│   └── liveSocket.js          WebSocket subscribe + message dispatch
└── utils/
    └── chartTime.js           utcToNseChartTime (IST display shift)
```

**Extension rule:** each new panel (watchlist, alerts, timeframe selector) gets its own component; shared data fetching stays in `services/`.

---

## 5. Data flow (MVP1)

### 5.1 Startup / session recovery

```
Application start
    → MarketConnectivityRunner
    → MarketBootstrapService.recoverSession()
         ├── fetch intraday candles (today so far)
         ├── fetch historical candles (prior sessions)
         ├── MarketSeedMerger deduplicates by epoch
         └── CandleEngine.seed()
    → UpstoxFeedClient connects (if live-feed-enabled)
    → ticks → TickHandler → CandleEngine.processTick()
```

### 5.2 Live tick → candle → frontend

```
Upstox WebSocket (Protobuf, mode=full)
    → Tick { price, timestampMs, volumeTradedToday (vtt) }
    → CandleEngine.processTick()
         ├── floor timestamp to IST 5m boundary
         ├── volume = delta between successive vtt readings
         ├── update in-progress candle OR close + open new bar
         └── publish CandleUpdatedEvent / CandleClosedEvent
    → LiveCandleBroadcaster (throttled ~1s)
    → JSON over /ws/live → frontend series.update()
```

### 5.3 REST seed on chart load

```
GET /api/market/candles  →  full in-memory history
GET /api/market/symbol   →  RELIANCE, instrument key, timeframe
GET /api/market/status   →  market phase, bootstrap state, feed health
```

---

## 6. Timezone design (critical)

Lightweight Charts has **no native timezone support** — it always renders UTC wall-clock components.

| Layer | Responsibility |
|---|---|
| Backend | All candle `time` values are **real UTC epoch seconds**, aligned to NSE session boundaries via `Asia/Kolkata` in `CandleBoundaryUtils` |
| API / WebSocket | Emit real UTC epochs unchanged |
| Frontend storage | `candlesRef` Map keyed by real UTC `candle.time` |
| Frontend chart | `utcToNseChartTime()` shifts timestamps **only at render** so LWC displays IST (09:15 open, not 03:45) |

Implementation uses `Intl.DateTimeFormat.formatToParts` (not the docs' `toLocaleString` round-trip, which breaks when the browser is already in IST).

Reference: [Lightweight Charts — Time zones](https://tradingview.github.io/lightweight-charts/docs/time-zones)

---

## 7. API surface

### 7.1 Implemented (MVP1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/api/market/symbol` | Default symbol metadata |
| GET | `/api/market/candles?from=&to=` | Historical + seeded candles |
| GET | `/api/market/status` | Market phase, bootstrap, feed status |
| WS | `/ws/live` | Live candle + status stream |

**WebSocket client → server:**
```json
{ "type": "subscribe", "timeframe": "5m" }
```

**WebSocket server → client:**
```json
{ "type": "candle_update", "candle": { "time": 1783395900, "open": ..., "high": ..., "low": ..., "close": ..., "volume": ... }, "isFinal": false }
{ "type": "candle_closed", "candle": { ... }, "isFinal": true }
{ "type": "market_status", "marketPhase": "open" }
```

### 7.2 Planned (from spec — not yet built)

| Area | Endpoints / messages |
|---|---|
| Watchlist | `GET/POST/DELETE /api/watchlist` |
| Per-symbol candles | `GET /api/symbols/{symbolId}/candles?timeframe=` |
| Patterns | `GET /api/symbols/{symbolId}/patterns` |
| Statistics | `GET /api/symbols/{symbolId}/statistics` |
| WebSocket | `pattern_event` messages for overlays + alerts |

When watchlist lands, evolve `/api/market/*` into the per-symbol routes above rather than adding parallel paths.

---

## 8. MVP1 scope (complete)

| Feature | Status |
|---|---|
| Single symbol (RELIANCE) | Done |
| Single timeframe (5m) | Done |
| Upstox historical + intraday seed | Done |
| Live tick feed → candles | Done |
| REST candle history | Done |
| WebSocket live updates (throttled) | Done |
| Candlestick / line chart toggle | Done |
| NSE market phase (open / pre_open / closed) | Done |
| Session recovery on restart | Done |
| IST chart display | Done |
| Watchlist | Not started |
| Multi-timeframe | Not started |
| Pattern detection | Not started |
| Database / persistence | Not started |
| Alerts | Not started |

---

## 9. Planned architecture extensions

### 9.1 MVP1.5 — Multi-timeframe

- Extend `CandleEngine` to maintain parallel `SymbolState` per timeframe (already keyed by `instrumentKey + timeframe`).
- Add `TimeframeSelector` in frontend; on change: unsubscribe WS, re-fetch candles, `setData()`, re-subscribe.
- **Do not** resample candles client-side — always fetch the authoritative timeframe from backend.

### 9.2 MVP2 — Watchlist (in-memory first; hard cap 50)

**Delivered approach** (see `Multi-Symbol-Watchlist-Design-v1.0.md` rev 5) supersedes the earlier Postgres-first / max-10 plan:

```
WatchlistRepository (InMemoryWatchlistRepository first)
    → WatchlistController / WatchlistService
    → on add: resolve trading symbol via local Upstox NSE master cache,
              seed all supported timeframes, subscribe Upstox feed
    → on remove: unsubscribe, evict CandleEngine + broadcaster throttle keys,
                 hard-delete entry (in-memory)
    → hard product cap 50 (soft-warn at 40; POST → 409 when active count ≥ 50)
    → startup seed: NIFTY 50 index + 9 top Nifty equities (10 total, ordered;
                    index is primary / findPrimary)
```

**Postgres later** (drop-in `PostgresWatchlistRepository`): soft-delete via `removed_at` / `is_active` so pattern/journal history can still join after remove. In-memory phase remains hard-delete.

Frontend (v1): thin watchlist-driven **symbol switcher** for the main chart (no sparkline tiles / multi-tile panel yet).

### 9.3 MVP3 — Database schema

Tables from Implementation Plan Phase 4:
- `watchlist_symbols`
- `pattern_instances`, `pattern_events`, `pattern_outcomes`
- `pattern_statistics`
- `users` (settings JSON)

Candles remain in-memory for live serving; Postgres holds pattern journal and user config only.

### 9.4 MVP4 — Pattern Intelligence

```
CandleClosedEvent
    → PatternEvaluator (per symbol × timeframe)
         ├── Detector modules (Breakout, Breakdown, Consolidation, Volume Breakout)
         ├── Lifecycle state machine (Detected → Confirmed → ... → Succeeded/Failed)
         ├── ATR(14) computed on each close
         └── writes pattern_events to Postgres
    → AlertService (configurable stages)
    → pattern_event over /ws/live
```

Frontend overlays:
- `createPriceLine()` for reference levels
- `setMarkers()` for lifecycle transitions

Detector rules: see `Pattern-Definitions-v1.0-Final.md`.

### 9.5 Cross-cutting concerns for later phases

| Concern | Approach |
|---|---|
| Config | Centralize tunables in `application.yml` / env (thresholds from Implementation Plan Phase 0) |
| Throttling | Keep `candle-update-throttle-ms`; tune per symbol count |
| Reconnect | UpstoxFeedClient backoff; frontend WS auto-reconnect in `liveSocket.js` |
| Testing | Unit tests on `CandleEngine`, `MarketSeedMerger`, `NseMarketClock`; integration tests on `MarketController` |

---

## 10. Configuration reference

Environment (`.env` at project root):

| Variable | Purpose |
|---|---|
| `UPSTOX_ACCESS_TOKEN` | Bearer token for Upstox APIs (1-year analytics token) |

`application.yml` defaults:

```yaml
tip:
  upstox:
    access-token: ${UPSTOX_ACCESS_TOKEN:}
  market:
    default-symbol: RELIANCE
    default-instrument-key: "NSE_EQ|INE002A01018"
    default-timeframe: 5m
    live-feed-enabled: true
    candle-update-throttle-ms: 1000
  cors:
    allowed-origins: http://localhost:5173
```

---

## 11. Divergence from original Implementation Plan

The original plan assumed **Node.js + TypeScript + Fastify + PostgreSQL + Dhan**. The implemented MVP1 intentionally diverged:

| Original plan | Built |
|---|---|
| Node/Fastify backend | Spring Boot + Upstox Java SDK |
| Dhan broker | Upstox V3 |
| Multi-timeframe from day one | Single 5m timeframe |
| Postgres from Phase 0 | In-memory only |
| `/api/symbols/{id}/candles` | `/api/market/candles` (single-symbol shortcut) |

The **logical architecture** (provider abstraction, candle engine, event bus, own WebSocket to frontend) is unchanged. Future phases should follow the spec shapes in `Data-Flow-and-Frontend-API-Spec-v1.0.md`, migrating MVP1 endpoints rather than maintaining two parallel APIs.

---

## 12. Suggested next implementation order

1. **Multi-timeframe** — smallest change, validates `CandleEngine` scaling
2. **Watchlist + Postgres** — unlocks multi-symbol UI
3. **ATR(14) on candle close** — prerequisite for all detectors
4. **Breakout / Breakdown detectors** — first pattern journal writes
5. **Consolidation + Volume Breakout** — complete MVP1 detector set
6. **Chart overlays + alerts feed** — frontend consumption of `pattern_event`

Hand one phase at a time to the coding agent; confirm the "done when" checkpoint from `Implementation-Plan-v1.0.md` before proceeding.

---

*Last updated: July 7, 2026 — MVP1 vertical slice complete.*
# Data Flow & Frontend API Specification (v1.0)

Scope of this document: exactly which external APIs the backend calls, how data moves from the broker to the database/memory to the frontend, and how the frontend renders both a line chart and a candlestick chart from that data. Pairs with the MVP 1 Consolidated Design, Pattern Definitions, and Implementation Plan documents.

---

## 1. External APIs — where the data actually comes from

All of this goes through the `MarketDataProvider` interface (see Design doc, section 5.5) — the concrete calls below are what `UpstoxProvider` does internally; nothing above it talks to Upstox directly.

| Purpose | Upstox API | When it's called |
|---|---|---|
| Auth | Analytics Token (generated once, 1-year validity, used as Bearer token) | Once, stored in config |
| Resolve symbol → instrument key | Instrument Search API (or cached instrument master file) | Once per symbol, when added to the watchlist |
| Historical candles (past days) | `GET /v3/historical-candle/:instrument_key/:unit/:interval/:to_date/:from_date` | On symbol add, and on backend restart (session recovery) |
| Today's candles so far | `GET /v3/historical-candle/intraday/:instrument_key/:unit/:interval` | On symbol add mid-session, and on restart |
| Live feed URL | `GET get-market-data-feed-authorize-v3` | Once per WebSocket (re)connect |
| Live ticks | Market Data Feed V3 WebSocket (Protobuf, `mode: "full"`) | Continuously during market hours |

**Note on `mode: "full"`:** this is what gives us `vtt` (cumulative volume traded today), which the Candle Engine needs to compute per-candle volume (delta between candle-close `vtt` values) — the lighter `ltpc` mode doesn't include it, and the Volume Breakout detector depends on it.

---

## 2. Backend data flow — broker to database/memory

```
Upstox WebSocket (Protobuf ticks)
        |
        v
MarketDataProvider.onTick(tick)
        |
        v
Candle Engine
  - updates in-progress candle for every timeframe (1m,3m,5m,15m,30m,1h,1d)
  - computes ATR(14) as candles close
        |
        +--------------------------+
        v                          v
  CandleUpdated event        CandleClosed event
        |                          |
        v                          v
   (Chart consumers)        Pattern Intelligence
                                   |
                     +-------------+-------------+
                     v                           v
              Lifecycle transition          Pattern Journal
              (Detected/Confirmed/...)       (Postgres write)
                     |
                     v
                  Alerts
                     |
                     v
        Backend's own WebSocket (to frontend)
```

Two different WebSockets are involved and it's easy to conflate them: **Upstox's WebSocket** feeds the backend; **our own WebSocket** (built in Phase 9 of the Implementation Plan) feeds the frontend. The frontend never talks to Upstox directly, and never sees Upstox's protobuf format — the backend re-emits everything as plain JSON on its own connection.

---

## 3. Backend → Frontend: the actual API surface

### 3.1 REST endpoints (request/response, for anything that isn't a live stream)

| Endpoint | Purpose |
|---|---|
| `GET /api/watchlist` | List active watchlist symbols |
| `POST /api/watchlist` | Add a symbol (hard cap **50** active; rejects with clear error when at cap) |
| `DELETE /api/watchlist/{symbolId}` | Remove a symbol |
| `GET /api/symbols/{symbolId}/candles?timeframe=5m&from=...&to=...` | Historical candles to seed a chart on load |
| `GET /api/symbols/{symbolId}/patterns?status=active` | Active/recent pattern instances for chart overlay |
| `GET /api/symbols/{symbolId}/statistics?patternType=breakout&timeframe=5m` | Gated stats — returns `{ "status": "insufficient_history", "sampleSize": 4 }` below threshold, or the real numbers above it |

### 3.2 WebSocket (our own, backend → frontend)

Endpoint: `/ws/live`. Frontend sends a subscribe message per symbol+timeframe it's currently displaying:

```json
{ "type": "subscribe", "symbolId": "NSE_EQ|...", "timeframe": "5m" }
```

Server pushes three message types:

**`candle_update`** — the currently-forming candle, throttled to roughly once per second (not on every tick — with multiple symbols and timeframes, pushing every raw tick would flood the browser for no visual benefit faster than a human can perceive anyway):
```json
{
  "type": "candle_update",
  "symbolId": "NSE_EQ|...",
  "timeframe": "5m",
  "candle": { "time": 1751880600, "open": 1450.2, "high": 1452.0, "low": 1449.8, "close": 1451.5, "volume": 18400 },
  "isFinal": false
}
```

**`candle_closed`** — same shape, `isFinal: true`, fired once when a timeframe boundary passes. This is the frontend's cue to "lock in" the bar and start a fresh one.

**`pattern_event`** — a lifecycle transition, used for both chart overlays and the alerts feed:
```json
{
  "type": "pattern_event",
  "symbolId": "NSE_EQ|...",
  "timeframe": "5m",
  "patternType": "breakout",
  "stage": "confirmed",
  "referenceLevel": 1448.0,
  "price": 1451.5,
  "time": 1751880600
}
```

---

## 4. Frontend charting — line chart and candlestick chart

**Library:** TradingView Lightweight Charts, unchanged from the design doc. It natively supports both a `LineSeries` and a `CandlestickSeries` reading from the *same* underlying OHLC data — you don't need two different charting libraries or two separate data pipelines for the two chart types.

### 4.1 Shared data, two views

Both chart types are driven by the same array of candle objects (`{ time, open, high, low, close, volume }`) fetched from `GET /api/symbols/{symbolId}/candles`:

- **Candlestick view** — the default/main analysis view. Full OHLC per bar; this is what you'd use to actually watch pattern formation, wicks, and reference levels.
- **Line view** — plots only the `close` value as a continuous line. Lighter-weight, useful for a quick-glance multi-symbol overview (e.g. small sparkline-style tiles for all 10 watchlist symbols at once) where full candle detail isn't needed.

A single toggle in the UI switches which series type reads the in-memory candle array — it's a rendering choice, not a different data fetch.

### 4.2 Load sequence for a chart panel

1. On opening a symbol/timeframe, `GET /api/symbols/{symbolId}/candles?timeframe=5m` and call `series.setData(candles)` once, to seed the full historical view.
2. Send the WebSocket `subscribe` message for that symbol+timeframe.
3. On each `candle_update`, call `series.update(candle)` — Lightweight Charts treats this as an upsert of the last bar, so repeated updates to the same in-progress candle just redraw it in place.
4. On `candle_closed` (`isFinal: true`), the same `series.update(candle)` call finalizes that bar; the next `candle_update` for a new timestamp starts a new bar automatically.
5. Switching timeframe (e.g. 5m → 15m) means: unsubscribe the old timeframe, re-fetch historical candles for the new timeframe, `setData()` again, subscribe to the new timeframe. Don't try to reconstruct a 15-minute view by resampling already-received 5-minute data client-side — always go back to the backend for the correct timeframe's own candles, since that's what the Candle Engine already computed authoritatively.

### 4.3 Pattern overlays on the chart

- **Reference level** (the breakout/breakdown trigger price) → `createPriceLine()`, a horizontal dashed line at that price.
- **Retest zone** → a shaded price band (Lightweight Charts doesn't have a built-in band primitive, so this is typically two overlapping price lines or a custom drawing primitive — a reasonable MVP shortcut is just the reference-level line plus a marker when a retest actually happens).
- **Lifecycle stage markers** (Detected, Confirmed, Succeeded, Failed) → `setMarkers()`, one marker per pattern instance at the candle where that transition occurred, color-coded by stage.

### 4.4 Component shape (suggested, not prescriptive)

- `ChartContainer` — owns one Lightweight Charts instance, holds current symbol/timeframe/chart-type state, owns the WebSocket subscription lifecycle for whatever it's currently displaying.
- `ChartTypeToggle` — line vs candlestick, swaps the series type without touching the data fetch.
- `TimeframeSelector` — triggers the re-fetch + re-subscribe sequence in 4.2.
- `AlertsFeed` — separate component, subscribes to `pattern_event` messages across all watchlist symbols (not just the one currently charted), independent of which chart is open.

---

## 5. One thing worth deciding before building this

The `candle_update` throttle (proposed: ~1/second) is a judgment call, not a fixed Upstox or Lightweight Charts constraint — tune it based on how "live" you actually want the in-progress bar to feel versus how much WebSocket traffic you're comfortable with across up to 50 watchlist symbols × several open timeframes at once (UI typically subscribes only to the active chart symbol+timeframe).

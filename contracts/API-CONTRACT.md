# TIP-2 Frozen API Contract

**Status:** Frozen for Python migration. Frontend under `frontend/` is the consumer of truth.  
**Do not change** paths, status codes, or JSON field names without a coordinated frontend change.

Reference implementations: Java controllers in `../TIP/backend/src/main/java/com/tip/api/`.  
Narrative: `../Data-Flow-and-Frontend-API-Spec-v1.0.md` (also copied to repo root).

---

## Conventions

- Base URL (dev): `http://localhost:8080` (Vite proxies `/api` and `/ws`).
- JSON request/response; `Content-Type: application/json`.
- Auth via **JWT access token** (8h). After `POST /api/auth/login`, send  
  `Authorization: Bearer <accessToken>` on protected routes (no session cookies).
- Symbol path params may contain `|` and spaces — use `{symbolId:.+}` equivalent (greedy match) and `encodeURIComponent` on the client.
- Candle `time`: **UTC epoch seconds** (integer), IST-aligned bar starts.

---

## Health

### `GET /api/health`

- **Auth:** public  
- **Response:** 200 (body may be simple status string/object; keep current Java shape)

---

## Auth

### `POST /api/auth/login`

- **Auth:** public  
- **Body:** `{ "username": string, "password": string }`  
- **Success:** 200  
  ```json
  {
    "accessToken": "<jwt>",
    "tokenType": "Bearer",
    "expiresIn": 28800,
    "user": { /* UserDto */ }
  }
  ```  
- **Failure:** 401  

### `POST /api/auth/logout`

- **Auth:** public (idempotent)  
- **Success:** 200 `{ "status": "ok" }`  
- **Note:** JWT is stateless — client must discard `accessToken`. Server does not revoke.

### `GET /api/auth/me`

- **Auth:** `Authorization: Bearer <accessToken>` required  
- **Success:** 200 user DTO  
- **Unauthenticated:** 401 (frontend `apiAllow401` treats as logged out)

---

## Admin users (`/api/admin/users`) — ADMIN only

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/users` | List users |
| GET | `/api/admin/users/{id}` | One user |
| POST | `/api/admin/users` | Create (`CreateUserRequest`) |
| PUT | `/api/admin/users/{id}` | Update |
| POST | `/api/admin/users/{id}/password` | Set password |
| POST | `/api/admin/users/{id}/seed-cash` | Cash amount body |
| POST | `/api/admin/users/{id}/reset` | Wipe paper book then reset cash |
| POST | `/api/admin/users/{id}/trading` | Enable/disable trading flag |

Non-admin → **403**. Unauthenticated → **401**.

User DTO fields must match frontend `UserDto` / `adminUsersApi.ts`.

---

## Paper trading (`/api/paper`) — authenticated, `TIP_PAPER_ENABLED`

Simulated OMS only (AD0). Design: `Manual-Paper-Trading-Design-v1.0.md`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/paper/account` | `{ cashBalance, lockedCash, freeCash }` |
| GET | `/api/paper/orders` | Optional `?status=` |
| GET | `/api/paper/orders/{id}` | One order |
| POST | `/api/paper/orders` | Place (MARKET/LIMIT/SL/SL_M, MIS/CNC, optional `closeLotId`) |
| PATCH | `/api/paper/orders/{id}` | Modify qty/price/trigger |
| DELETE | `/api/paper/orders/{id}` | Cancel residual |
| GET | `/api/paper/positions` | `?openOnly=true` |
| GET | `/api/paper/fills` | Recent fills |
| GET | `/api/paper/ledger` | Paper cash ledger tail |
| GET | `/api/paper/ltp/{instrumentKey}` | Last tick price (UI) |

Errors often use FastAPI `detail` as `{ "code": "...", "message": "..." }` (e.g. `INSUFFICIENT_CASH`, `MARKET_CLOSED`, `INSTRUMENT_NOT_TRADABLE`).

---

## Market (`/api/market`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/market/timeframes` | Supported TFs + default |
| GET | `/api/market/symbol` | Primary/default symbol metadata |
| GET | `/api/market/status` | Phase, bootstrap, feed health |
| GET | `/api/market/candles?from=&to=` | Candles for **primary** symbol (shim) |

Shapes: see frontend `marketApi.ts` DTOs and Java `MarketStatusResponse`, `SymbolInfoResponse`, `CandleDto`.

### Candle object

```json
{
  "time": 1751880600,
  "open": 1450.2,
  "high": 1452.0,
  "low": 1449.8,
  "close": 1451.5,
  "volume": 18400
}
```

---

## Symbols

### `GET /api/symbols/{symbolId}/candles?timeframe=5m&from=&to=`

- Returns list of candle objects for that instrument + timeframe.
- `symbolId` is instrument key (encoded).

### `GET /api/symbols/{symbolId}/patterns?status=active`

- Pattern instances for chart overlays (fields per `PatternInstanceDto` / FE).

### `GET /api/symbols/{symbolId}/statistics?patternType=&timeframe=`

- Either full stats or gated:

```json
{ "status": "insufficient_history", "sampleSize": 4 }
```

---

## Pattern statistics (bulk)

### `GET /api/pattern-statistics?patternType=&timeframe=`

- Ranking / bulk stats over active watchlist (FE: `patternStatisticsApi.ts`).

---

## Watchlist

### `GET /api/watchlist`

- List **public-active** entries (excludes REMOVING), insertion order.
- Include bootstrap status fields used by FE.

### `POST /api/watchlist` — **ADMIN**

- Body:

```json
{ "symbol": "RELIANCE" }
```

and/or

```json
{ "instrumentKey": "NSE_EQ|INE002A01018" }
```

- **200** terminal entry (READY or FAILED)  
- **404** unknown symbol  
- **409** duplicate or hard max (50)  

### `DELETE /api/watchlist/{symbolId}` — **ADMIN**

- **204** No Content  
- **404** if not on list  

---

## Instruments

### `GET /api/instruments/search?q=...` (and any existing query params)

- Returns search hits for FE typeahead (`instrumentsApi.ts` / `InstrumentSearchHitDto`).

---

## WebSocket `/ws/live`

### Client → server

```json
{ "type": "subscribe", "symbolId": "NSE_INDEX|Nifty 50", "timeframe": "5m" }
```

- `symbolId` optional → primary/default  
- `timeframe` optional → market default (5m)  
- Reject unknown type, symbol not on public watchlist, unsupported TF  

### Server → client

**subscribed**

```json
{ "type": "subscribed", "symbolId": "…", "timeframe": "5m" }
```

**candle_update** / closed (same payload; `isFinal: true` when closed)

```json
{
  "type": "candle_update",
  "symbolId": "…",
  "timeframe": "5m",
  "candle": { "time": 0, "open": 0, "high": 0, "low": 0, "close": 0, "volume": 0 },
  "isFinal": false
}
```

Throttle in-progress updates ≈ **1000 ms** (`tip.market.candle-update-throttle-ms`).

**pattern_event**

```json
{
  "type": "pattern_event",
  "symbolId": "…",
  "timeframe": "5m",
  "patternType": "breakout",
  "stage": "confirmed",
  "referenceLevel": 1448.0,
  "price": 1451.5,
  "time": 1751880600
}
```

Stages broadcast: per `tip.pattern.ws.broadcast-stages`  
(default: detected, confirmed, retested, strengthened, succeeded, failed, expired).

**market status** messages (if emitted by Java `MarketStatusBroadcaster`) — preserve type/fields exactly when porting.

**Auth:** currently open (`/ws/**` permitAll). Do not require session without FE changes.

---

## Security matrix

| Path | Anonymous | USER | ADMIN |
|---|---|---|---|
| `/api/health` | ✓ | ✓ | ✓ |
| `/api/auth/login`, `/logout` | ✓ | ✓ | ✓ |
| `/api/auth/me` | 401 | ✓ | ✓ |
| `/api/**` (general) | 401 | ✓ | ✓ |
| POST/DELETE `/api/watchlist` | 401 | 403 | ✓ |
| `/api/admin/**` | 401 | 403 | ✓ |
| `/ws/**` | ✓ | ✓ | ✓ |

**memory profile:** all endpoints permitAll (local chart without users/DB).

CORS: allow FE origins (e.g. `http://localhost:5173`, production tip2-web). Auth via `Authorization` header (not cookies).

---

## Error semantics to preserve

| Situation | HTTP |
|---|---|
| Not logged in (protected API) | 401 |
| Logged in, insufficient role | 403 |
| Symbol not found (watchlist add / remove) | 404 |
| Duplicate watchlist / max size | 409 |
| Patterns feature disabled | as Java `PatternExceptionHandler` (document exact code when porting) |

---

## Out of scope for contract changes

- Adding REST fields “for convenience” without FE use  
- Renaming `symbolId` → `instrumentKey` in public JSON  
- Changing candle `time` to milliseconds  
- Moving WS to Socket.IO or different path  

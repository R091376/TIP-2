# Product decisions (review before each implementation phase)

Last updated: 2026-07-24. Revisit when starting paper trading or last-day replay.

## Market candles (NSE cash)

| Decision | Choice |
|----------|--------|
| Intraday grid | **Session-anchored at 09:15 IST** (not midnight % interval) |
| First bars | 5m@09:15, 15m@09:15, 1h@09:15, 4h@09:15 — matches Upstox History V3 |
| Pre-open stamps | Dropped on seed remap; not pattern-eligible |
| Live ticks | Still gated to wall-clock `OPEN` (09:15–15:30); floor uses same session grid |
| Mid-session quiet | `close_stale_open_candles` when bucket &lt; floor(now) |
| Session end | **`finalize_session_candles`** force-closes all open *intraday* bars on `CLOSED` (before pattern session expiry); last RTH bar always emits `CandleClosed` |
| Daily | Calendar midnight IST; **not** force-closed at cash session end |

## Users & admin

| Decision | Choice |
|----------|--------|
| Roles | `ADMIN` (you), `USER` (paper traders) |
| Signup | Admin creates users (no public self-signup v1) |
| Auth | JWT Bearer access token (8h), stored in browser. No OAuth. No session cookies. |
| Admin powers | Create users, set passwords, seed cash, reset cash, enable/disable trading, deactivate |
| Default admin | `admin` / `TIP_ADMIN_PASSWORD` (default `admin`) |
| Starting cash | ₹100,000 INR (configurable `tip.users.default-seed-cash`) |
| Storage | PostgreSQL `app_users` + `cash_ledger` |

## Watchlist

| Decision | Choice |
|----------|--------|
| Scope | **Shared global** watchlist |
| Mutate | **ADMIN only** (add/remove) |
| Read | Any authenticated user |

## Paper trading / deploy strategies

**Authoritative design:** [`../Paper-Strategy-Design-v1.0.md`](../Paper-Strategy-Design-v1.0.md) (locked 2026-07-17).

| Decision | Choice |
|----------|--------|
| Mode | **Paper only** (no live broker) |
| Who deploys | **All authenticated users** (if trading enabled) |
| Strategies | **Many named** strategies per user |
| Universe | Multi-select symbols × timeframes × patterns |
| Direction | Long / short / both |
| Entry trigger | Default **confirmed** |
| Entry fill | **Closed-bar confirm close** (not live LTP for v1 entry) |
| Stop/target after fill | **Frozen** on paper position at fill |
| Risk | **% of strategy allocated capital** per trade |
| Allocation cap | Sum of **ARMED** allocations ≤ **account cash** |
| Consolidation | **Excluded** from auto-trade strategies |
| Square-off | **Force flat** end of session |
| Ledger | Orders + trades (per user) |
| Modularity | Trading modules **no direct** `com.tip.patterns` dependency |
| Reset cash | Admin only |
| Costs | Simplified brokerage (define at implement time) |

## Deferred

- Full strategy **backtesting** (later)
- **Last trading day replay** (after paper trading)
- Real broker / live orders
- Entry fill on live LTP (optional later; v1 is closed-bar)

## Implementation order

1. **Users** (done / in progress)  
2. **Paper strategy deployment** (design locked — implement next)  
3. Last-day replay  
4. Backtesting (later)

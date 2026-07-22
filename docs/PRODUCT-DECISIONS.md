# Product decisions (review before each implementation phase)

Last updated: 2026-07-16. Revisit when starting paper trading or last-day replay.

## Users & admin

| Decision | Choice |
|----------|--------|
| Roles | `ADMIN` (you), `USER` (paper traders) |
| Signup | Admin creates users (no public self-signup v1) |
| Auth | Session cookie login (simple). Not JWT. “Auth light” — no OAuth. |
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

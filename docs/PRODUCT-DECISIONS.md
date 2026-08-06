# Product decisions (review before each implementation phase)

Last updated: 2026-07-29. Revisit when starting last-day replay or strategy bots.

## Market candles (NSE cash)

| Decision | Choice |
|----------|--------|
| Intraday grid | **Session-anchored at 09:15 IST** (not midnight % interval) |
| First bars | 5m@09:15, 15m@09:15, 1h@09:15, 4h@09:15 — matches Upstox History V3 |
| Pre-open stamps | Dropped on seed remap; not pattern-eligible |
| Live ticks | Still gated to wall-clock `OPEN` (09:15–15:30); floor uses same session grid |
| Mid-session quiet | `close_stale_open_candles` when bucket &lt; floor(now) |
| Session end | **`finalize_session_candles`** force-closes all open *intraday* bars on `CLOSED` (before pattern session expiry); last RTH bar emits `CandleClosed` **only for the same IST calendar day** |
| Pre-open seed | Yesterday's last RTH bar is **closed**, not left as current (avoids next-day re-alerts for the prior last candle) |
| Daily | Calendar midnight IST; **not** force-closed at cash session end |

## Users & admin

| Decision | Choice |
|----------|--------|
| Roles | `ADMIN` (you), `USER` (paper traders) |
| Signup | Admin creates users (no public self-signup v1) |
| Auth | JWT Bearer access token (8h), stored in browser. No OAuth. No session cookies. |
| Admin powers | Create users, set passwords, seed cash, reset cash (wipes paper), enable/disable trading, deactivate |
| Default admin | `admin` / `TIP_ADMIN_PASSWORD` (default `admin`) |
| Starting cash | ₹100,000 INR (configurable `tip.users.default-seed-cash`) |
| Storage | PostgreSQL `app_users` + `cash_ledger` |
| **Learn education** | Standalone desk at `/learn` (sidebar **Learn**, not nested under Admin). Still **ADMIN-only** access. Beginner explanations of indicators/patterns. **Operator UX**, not ACL of proprietary math. Flag: `VITE_FEATURE_ADMIN_LEARN` (default ON). Design: `docs/design-admin-learn-education.md` |

## Watchlist

| Decision | Choice |
|----------|--------|
| Scope | **Shared global** watchlist |
| Mutate | **ADMIN only** (add/remove) |
| Read | Any authenticated user |

## Paper trading (manual OMS) — v1

> **v1 source of truth:** [`../Manual-Paper-Trading-Design-v1.0.md`](../Manual-Paper-Trading-Design-v1.0.md)  
> Pattern-driven strategy bots ([`../Paper-Strategy-Design-v1.0.md`](../Paper-Strategy-Design-v1.0.md)) are **deferred** for a later phase and may reuse paper ledger/lots.

| Decision | Choice |
|----------|--------|
| Mode | **Paper only** (no live broker) |
| Who trades | Authenticated users with `tradingEnabled` |
| Entry | **Manual** order ticket (MARKET / LIMIT / SL / SL-M) |
| Fills | **Live Upstox ticks**; market fills on **next matcher tick** after accept |
| Positions | **Separate lots** (no netting); close via `closeLotId` |
| Product | **MIS** (force-flat 15:20 IST) / **CNC** (overnight) per order |
| Side | Long and short |
| Universe | Watchlist **NSE_EQ** equities only (EQ/BE); **no index** |
| Capital | 1× cash lock; free = balance − locks; funding cap at fill |
| Costs | **Zero** v1 |
| UI | Dedicated `/paper` desk **and** chart-integrated paper Buy/Sell (see below) |
| Reset | Admin reset wipes paper then resets cash |

## App shell (broker-style chrome) — shipped

> **Design SoT:** [`../UI-Layout-Design-v1.0.md`](../UI-Layout-Design-v1.0.md)

| Decision | Choice |
|----------|--------|
| Chrome | Left **sidebar** app shell for all authenticated routes; login stays outside shell |
| Nav | Stats → Pattern Stats; Charts → `/`; Watchlist/Alerts → `/?panel=…` (chart rail); Orders → `/paper/orders`; Positions → `/paper` |
| Positions UI | Three metric cards (Today P&L, Total P&L, closed-lot Win Rate) + dense table + Close |
| Orders UI | Open Orders / Order History panel, client filters, Buy/Sell pills, Working residual qty, Cancel |
| Flag | **`VITE_FEATURE_APP_SHELL`** (default **ON**); shell is the only authenticated layout |

## Chart-integrated paper Buy/Sell — shipped

> **Design SoT:** [`../Chart-Paper-Trade-Design-v1.0.md`](../Chart-Paper-Trade-Design-v1.0.md)

| Decision | Choice |
|----------|--------|
| Entry points | Chart header **Buy** / **Sell** open a snapshot paper order modal; full desk remains at `/paper` |
| Scope | Place only (MARKET / LIMIT / SL / SL-M); no close-lot from chart; open-orders strip under chart |
| Feature flag | **`VITE_FEATURE_CHART_PAPER_TRADE`** (default **ON**); gates trade chrome only — `ChartHeader` always mounts |
| Mobile | Compact chips ≤768; PAPER badge hide ≤480; **B/S** labels ≤380; touch min-height 40–44px; collapse priority for Admin@375px |
| Backend | **No** schema changes; reuses existing `/api/paper/*` |

## Deferred

- Pattern **strategy auto-trade** (see Paper-Strategy-Design)
- Full strategy **backtesting**
- **Last trading day replay**
- Real broker / live orders
- Brokerage / STT models

## Implementation order

1. **Users** (done)  
2. **Manual paper OMS** (done)  
3. **Chart paper Buy/Sell ticket** (done — header, modal, toast, strip; flag `VITE_FEATURE_CHART_PAPER_TRADE`)  
4. Last-day replay  
5. Strategy bots / backtesting (later)

# Paper Strategy Deployment — Design Document

| Field | Value |
|---|---|
| **Document** | Paper Strategy Deployment Design v1.0 |
| **Date** | 2026-07-17 |
| **Status** | Approved (product-locked for implementation) |
| **Repo path** | `Paper-Strategy-Design-v1.0.md` (repo root) |
| **Related** | `docs/PRODUCT-DECISIONS.md`, `Pattern-Intelligence-Design-v1.0.md`, `docs/modules/journal.md`, `Architectural-Decisions.md` (AD0 evolution for **paper** only) |

---

## Overview

Users deploy **named paper strategies** that listen for pattern lifecycle **signals**, size positions from **allocated capital** and **risk %**, place **paper market fills**, manage stops/targets, **force-flat** at session end, and expose an **orders/trades ledger**.

This is **paper trading only** — no real broker / live OMS. Pattern detectors remain a separate package; trading code **must not** depend on `com.tip.patterns` directly.

---

## Product decisions (locked)

### Mode & access

| ID | Decision |
|---|---|
| **PS-1** | **Paper trading only.** UI and copy must label Paper clearly. |
| **PS-2** | **All authenticated users** may create/arm strategies (subject to existing `tradingEnabled` / account active flags). |
| **PS-3** | **Many named strategies** per user (not a single global bot). |

### Universe & direction

| ID | Decision |
|---|---|
| **PS-4** | Strategy universe is **multi-select**: symbols, timeframes, pattern types. |
| **PS-5** | Symbols must be on the **shared watchlist**. |
| **PS-6** | Direction filter: **LONG**, **SHORT**, or **BOTH**. Users may trade both sides. |
| **PS-7** | **Consolidation is excluded** from auto-trade strategy pattern pickers and from signal matching. It may remain on charts/stats only. |

### Entry trigger & fill

| ID | Decision |
|---|---|
| **PS-8** | Default entry trigger stage = **`confirmed`** (where the pattern supports Confirmed). |
| **PS-9** | **Confirm fill = closed-bar confirm.** When a signal is accepted at Confirmed, paper **entry fill price = that closed bar’s close** (non-repainting, consistent with pattern eval). Not next-tick LTP for v1 entry. |
| **PS-10** | Patterns without a Confirmed stage (e.g. consolidation) are **not auto-tradable** (see PS-7). |

### Risk, capital, sizing

| ID | Decision |
|---|---|
| **PS-11** | Each strategy has **`allocatedCapital`** (INR). |
| **PS-12** | **Max risk per trade** = **% of that strategy’s allocated capital** (not full account by default). |
| **PS-13** | **Allocated cash constraint:** sum of `allocatedCapital` over a user’s strategies that are **ARMED** (or otherwise capital-reserving) **must not exceed** the user’s **available paper cash balance**. Reject create/update/arm that would violate this. |
| **PS-14** | Position size:  
    `riskRupees = allocatedCapital × (maxRiskPctPerTrade / 100)`  
    `qty = floor(riskRupees / |entryFill − stop|)`  
    then apply lot/cash/min-qty guards; reject if stop distance is zero/too small. |
| **PS-15** | Strategy also configures **max trades per day** (user-facing). Recommend also **max open positions** as an implementation default/guard (configurable). |

### Stops, targets after fill

| ID | Decision |
|---|---|
| **PS-16** | At paper fill, **copy stop and target onto the paper position** from the signal payload at that moment. |
| **PS-17** | **No target/stop updates after fill.** Later pattern lifecycle updates (e.g. retest rewrites measured target) **do not** move open paper positions. Open risk is frozen at entry. |
| **PS-18** | Entry for journal R-metrics on patterns may still be Detected close; **paper fill uses PS-9** (confirmed bar close). Do not confuse the two. |

### Session & exits

| ID | Decision |
|---|---|
| **PS-19** | **Force flat** at configured session end (NSE intraday square-off style; default around market close / product config, e.g. 15:20 IST — exact clock in config). |
| **PS-20** | Exits also fire when price hits **frozen stop** or **frozen target** (bar-close or engine rule TBD in implementation; prefer closed-bar consistency with PS-9 where practical). |

### Ledger

| ID | Decision |
|---|---|
| **PS-21** | Users see a **ledger** of **orders** and **trades/fills** (and open positions), filterable by strategy/day/symbol. |
| **PS-22** | Rejected/skipped signals should leave an auditable reason where practical (max trades, capital, allocation cap, trading disabled, etc.). |

### Architecture modularity

| ID | Decision |
|---|---|
| **PS-23** | Trading modules **must not** `import com.tip.patterns.*`. |
| **PS-24** | Patterns publish lifecycle events; a **thin bridge/adapter** maps them into a trading-owned **`SignalIntent`** (or equivalent) DTO. Only the bridge may know pattern package types. |
| **PS-25** | Suggested packages: `com.tip.trading.signals`, `com.tip.trading.strategy`, `com.tip.trading.risk`, `com.tip.trading.paper`, `com.tip.trading.ledger`, optional `com.tip.trading.bridge`. |

---

## Pattern Confirmed support (reference)

| Pattern | Auto-tradable v1 | Confirmed stage |
|---|---|---|
| breakout / breakdown | Yes | Yes |
| engulfing (bull/bear) | Yes | Yes |
| hammer / shooting_star | Yes | Yes |
| inside_bar | Yes | Yes |
| higher_high / lower_low | Yes | Yes |
| volume_breakout | Yes | Yes |
| **consolidation** | **No (PS-7)** | No Confirmed path |

---

## Strategy model (logical fields)

| Field | Description |
|---|---|
| `id`, `userId`, `name` | Identity |
| `status` | `DRAFT` \| `ARMED` \| `PAUSED` \| `STOPPED` |
| `symbolIds[]` | Multi-select watchlist keys |
| `timeframes[]` | e.g. 5m, 15m, … |
| `patternTypes[]` | Multi; **no consolidation** |
| `directions` | LONG \| SHORT \| BOTH |
| `entryTriggerStage` | Default `confirmed` |
| `allocatedCapital` | INR |
| `maxRiskPctPerTrade` | % of allocated |
| `maxTradesPerDay` | Integer |
| `maxOpenPositions` | Integer (guard) |
| `forceFlatTime` / session policy | Config + optional override |
| `createdAt`, `updatedAt` | Audit |

**Allocation invariant (PS-13):**

```text
sum(allocatedCapital of user strategies in capital-reserving status)
  ≤ user.availableCash
```

Exact set of capital-reserving statuses: at least **ARMED**; product may also reserve for PAUSED-with-open-positions later — v1: enforce on **ARMED** and on transitions into ARMED.

---

## Signal contract (trading-owned)

Bridge produces something equivalent to:

```text
SignalIntent
  symbolId, timeframe, patternType, direction
  stage                    // wire: confirmed, …
  instanceId               // de-dupe
  entryFillHint            // confirmed bar close (PS-9)
  stop, target             // rails at signal time
  eventTime, priceAtEvent
  atr optional
```

Strategy matcher and risk engine depend **only** on this contract.

---

## Runtime flow

```text
Closed candle → pattern lifecycle → Confirmed event
  → bridge → SignalIntent
  → match ARMED strategies (symbol, TF, pattern, direction, stage)
  → risk: allocation, day trade count, open positions, cash, qty (PS-14)
  → paper order FILLED @ confirmed bar close (PS-9)
  → freeze stop/target on position (PS-16–17)
  → ledger: order + fill
  → manage: stop/target hit; force-flat (PS-19)
```

---

## Ledger concepts

| Concept | Role |
|---|---|
| **Order** | Intent + status (NEW / FILLED / REJECTED / CANCELLED) |
| **Fill / trade** | Price, qty, time, fees (if any later) |
| **Position** | Open paper position with frozen entry/stop/target |
| **Cash movement** | Debit/credit linked to fills and flat; align with existing `cash_ledger` where possible |
| **Skip / reject reason** | Optional audit for non-fills |

---

## UI surfaces (v1)

1. **Strategies** — list/create/edit/arm/pause/stop; multi-select universe; risk fields; allocation validation.  
2. **Ledger** — orders & trades (and open positions), per user, filter by strategy.  
3. **No real-money language**; Paper badge on deploy and ledger.

Chart page remains primary for live viewing; strategy UI is a **separate page** (like pattern stats).

---

## Explicit non-goals (v1)

- Real broker execution / Upstox orders  
- Full backtest harness before deploy  
- Auto-trading **consolidation**  
- Moving stop/target after paper fill  
- Entry fill on live LTP (deferred; PS-9 is closed-bar)  
- Direct coupling of strategy code to `com.tip.patterns`

---

## Alignment with PRODUCT-DECISIONS

| Earlier product note | This design |
|---|---|
| Paper: market only, live LTP | **Entry fill overridden to closed-bar confirm close (PS-9)** for non-repaint consistency with patterns. Exits/force-flat may still use phase clock + bar rules. |
| Short allowed | **PS-6 BOTH** |
| Square-off allowed | **PS-19 force flat** |
| UI chart only | **Superseded:** strategy + ledger get **own pages** |
| Backtesting later | Still deferred |

Update `docs/PRODUCT-DECISIONS.md` when implementing so the paper table cites this document.

---

## Implementation notes (modular)

Suggested delivery slices:

1. Schema: strategies, orders, fills, positions (+ Flyway).  
2. `SignalIntent` + bridge from pattern events (only bridge touches patterns).  
3. Risk + allocation invariant.  
4. Paper fill + freeze rails + force-flat job.  
5. REST API + ledger UI + strategy UI.

Config prefix suggestion: `tip.trading.*` / `tip.paper.*`.

---

## Decision log (open nits resolved 2026-07-17)

| Topic | Choice |
|---|---|
| Confirm fill | **Closed-bar confirm close** |
| Target/stop after confirm fill | **Freeze on position at fill; no mid-trade updates** |
| Consolidation | **Remove from auto-trading strategies** |
| Allocated vs account cash | **Sum of armed allocations ≤ account cash** |

---

## Status

Ready for implementation planning / PR breakdown. No code dependency on this file at runtime; it is the product+architecture source of truth for paper strategy deployment.

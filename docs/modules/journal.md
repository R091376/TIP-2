# Module: Pattern journal

| Field | Value |
|---|---|
| **Package** | `com.tip.journal` |
| **Persistence** | Postgres only (disabled when `tip.watchlist.store=memory`) |
| **Migration** | `V2__pattern_journal.sql` (+ V3/V4 type CHECK) |
| **Python** | `app/journal/postgres_journal.py` when `TIP_WATCHLIST_STORE=postgres`; else in-memory |
| **Status** | **Implemented** — `V2__pattern_journal.sql`, `PostgresPatternJournal`, `NoOpPatternJournal` |

## Purpose

Durable **event-sourced** record of pattern setups:

1. **Instances** — open/closed setups with frozen rails  
2. **Events** — append-only lifecycle transitions  
3. **Outcomes** — terminal metrics (including MFE/MAE in R)  
4. **Statistics** — per `(symbol_id, pattern_type, timeframe)` aggregates  

Patterns never write SQL directly; the app calls `PatternJournal` after pure pattern evaluation.

## Tables

| Table | Role |
|---|---|
| `pattern_instances` | One row per setup |
| `pattern_events` | One row per stage (unique per instance+stage) |
| `pattern_outcomes` | 1:1 terminal row |
| `pattern_statistics` | Running aggregates |

`symbol_id` = Upstox instrument key; FK to `watchlist_symbols` (soft-delete friendly).

## Write path

| Pattern result | Journal action |
|---|---|
| New Detected | Insert instance + event `detected` |
| Stage advance | Update flags/status + insert event |
| Terminal Succeeded/Failed/Expired | Update instance ended; insert event; insert outcome; upsert statistics |

Stats upsert uses row lock (`SELECT … FOR UPDATE`) inside the same transaction as the outcome.

## Statistics formulas

```text
sample_size   = success + fail + expired
success_rate  = success / sample_size          // inventory (includes expired)
resolved_n    = success + fail
resolved_success_rate = success / resolved_n   // performance (excludes expired)

// Running means only over outcomes with non-null metric samples
avg_move_r, avg_mfe_r, avg_mae_r, avg_duration_candles
```

API gate: return real stats only if `sample_size >= 20`; else `insufficient_history`.

Statistics are keyed by `(symbol_id, pattern_type, timeframe)` — Breakout and Breakdown aggregate separately.

### Research ranking API

| Endpoint | Source |
|---|---|
| `GET /api/pattern-statistics?patternType=&timeframe=` | **`pattern_statistics` only** (+ active watchlist filter for symbol ids / labels) |
| `GET /api/pattern-statistics/query?…` | **Query-time** `pattern_instances` ⨝ `pattern_outcomes` (composable stack filters) |

- Bulk: authenticated (all roles). 503 when patterns disabled.
- Research query: **ADMIN only**; requires Postgres journal + `TIP_PATTERN_RESEARCH_STATS_ENABLED`. Design: `docs/design-composable-stack-filters.md`.
- Woodie daily S/R stamps (`sr_*` on instances, `daily_sr_levels`): design `docs/design-woodie-sr.md`. Query-time research filters only; dashboard cube unchanged.
- Always returns S/F/E counts; rates/means only when `sample_size >= minSampleSize`.
- Frontend: `/patterns/stats` (Dashboard + ADMIN Research mode).

## When journal is off

| Condition | Behavior |
|---|---|
| `tip.watchlist.store=memory` | No DataSource/Flyway; `NoOpPatternJournal` |
| `tip.pattern.enabled=false` | No evaluation / 503 on pattern REST |

## Hydrate vs expire (startup)

| TF class | Startup |
|---|---|
| session_close (`1m`…`1h`) | Expire open rows (`startup_recovery`), NULL excursions |
| multi-day (`4h`,`1d`) | Hydrate into memory; recompute MFE/MAE from closed candles |

## Related

- Design: `Pattern-Intelligence-Design-v1.0.md` (Data Model, PI-15/19/23/26)
- Pattern stages: `docs/patterns/breakout.md`

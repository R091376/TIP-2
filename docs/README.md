# TIP technical documentation

Authoritative math and lifecycle docs for indicators, patterns, and the pattern journal.

| Area | Path |
|---|---|
| Indicators | [`indicators/`](indicators/) (ATR, Donchian, Volume SMA) |
| Patterns | [`patterns/`](patterns/) |
| Modules (journal, …) | [`modules/`](modules/) |
| Classical patterns (double / H&S) | [`design-classical-patterns.md`](design-classical-patterns.md) — implemented; [`patterns/double-bottom.md`](patterns/double-bottom.md), [`double-top.md`](patterns/double-top.md), [`head-shoulders.md`](patterns/head-shoulders.md), [`inverse-head-shoulders.md`](patterns/inverse-head-shoulders.md) |
| Historical P2–P5 sketch | [`design-patterns-stack-and-filtered-stats.md`](design-patterns-stack-and-filtered-stats.md) — P2/P3 superseded by the classical design |
| **Design: composable stack filters (P0 research stats)** | [`design-composable-stack-filters.md`](design-composable-stack-filters.md) — implement when ready |
| **Design: Woodie daily S/R** | [`design-woodie-sr.md`](design-woodie-sr.md) |
| Learn (operator education) | `/learn` in the app; Woodie topic at `/learn/concepts/woodie-sr` |

## Standards

- Every indicator and pattern implementation must have a matching doc in this tree.
- Pattern docs must list **all lifecycle stages** and terminal outcomes.
- Design overview: [`../Pattern-Intelligence-Design-v1.0.md`](../Pattern-Intelligence-Design-v1.0.md).
- Detector rule defaults: [`../Pattern-Definitions-v1.0-Final.md`](../Pattern-Definitions-v1.0-Final.md).
- Manual paper OMS (v1): [`../Manual-Paper-Trading-Design-v1.0.md`](../Manual-Paper-Trading-Design-v1.0.md).
- Paper strategy bots (deferred): [`../Paper-Strategy-Design-v1.0.md`](../Paper-Strategy-Design-v1.0.md).

## Data flow (summary)

```
market (closed candles)
  → indicators (ATR, Donchian, …)
  → patterns (Breakout / Breakdown / classic candles / consolidation / volume breakout / double / H&S, …)
  → journal (Postgres)
  → REST / WebSocket
```

Dependency rule: `patterns → indicators` only. Patterns never open a DB connection; journal never decides whether a breakout exists.

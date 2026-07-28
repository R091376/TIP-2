# TIP technical documentation

Authoritative math and lifecycle docs for indicators, patterns, and the pattern journal.

| Area | Path |
|---|---|
| Indicators | [`indicators/`](indicators/) (ATR, Donchian, Volume SMA) |
| Patterns | [`patterns/`](patterns/) |
| Modules (journal, …) | [`modules/`](modules/) |

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
  → patterns (Breakout / Breakdown / classic candles / consolidation / volume breakout, …)
  → journal (Postgres)
  → REST / WebSocket
```

Dependency rule: `patterns → indicators` only. Patterns never open a DB connection; journal never decides whether a breakout exists.

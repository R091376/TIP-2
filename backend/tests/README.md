# Backend tests (planned)

Port every class under `../reference/java-tests/` into pytest modules listed in `../../MIGRATION.md` §6.

| Suite | Directory |
|---|---|
| Config | `tests/config/` |
| Market / feed | `tests/market/` |
| Indicators | `tests/indicators/` |
| Instruments / watchlist / users | `tests/instrument/`, `tests/watchlist/`, `tests/user/` |
| Patterns | `tests/patterns/` |
| HTTP / WS | `tests/api/` |

Run (after implementation):

```bash
pytest -q
```

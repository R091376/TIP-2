# TIP-2 Backend (Python)

Python 3 FastAPI port of the TIP Java backend. See `../MIGRATION.md`.

## Run (memory profile — no Postgres)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:TIP_WATCHLIST_STORE = "memory"
$env:UPSTOX_ACCESS_TOKEN = "<your token>"   # optional for live seed/feed
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Frontend Vite proxies `/api` and `/ws` → `localhost:8080`.

## Run (Postgres — durable watchlist + pattern journal)

```powershell
# Create DB first: createdb tip  (or use Docker Postgres)
$env:TIP_WATCHLIST_STORE = "postgres"
$env:DATABASE_URL = "postgresql+psycopg://postgres:admin@localhost:5432/tip"
# Flyway V1–V5 applied on startup (watchlist + journal tables + users)
uvicorn app.main:app --port 8080
```

Journal tables: `pattern_instances`, `pattern_events`, `pattern_outcomes`, `pattern_statistics`.  
On startup: session-close TFs (`1m`/`5m`/`15m`) open instances expire with `startup_recovery`; `1h`/`4h`/`1d` opens hydrate into the in-process active store.

## Tests

```powershell
cd backend
python -m pytest -q
```

## Layout

```text
app/
  main.py           # FastAPI + lifespan
  config.py         # settings parity with application.yml
  api/              # REST + /ws/live
  market/           # candle engine, Upstox REST/WS, clock, bootstrap
  indicators/       # ATR, Donchian, volume SMA
  instrument/       # NSE master cache
  patterns/         # detectors + in-memory journal/stats
  watchlist/        # memory + postgres repos, service
  user/             # bcrypt users / admin
db/migration/       # V1–V5 SQL
reference/          # Java oracles (read-only)
tests/              # pytest parity suite (growing)
```

## Single worker

In-memory candle/watchlist state is process-local. Run **one** Uvicorn worker:

```text
uvicorn app.main:app --workers 1 --port 8080
```

## Implemented modules

- Market: IST candle engine, seed merger, NSE clock/holidays, bootstrap, Upstox REST + V3 feed (protobuf stubs in `app/market/market_data_feed_pb2.py`)
- Watchlist: memory + postgres (Flyway V1–V5 on startup)
- Patterns: breakout, breakdown, pinbar (hammer/shooting star), engulfing, inside-bar, HH/LL structure, consolidation, volume-breakout + lifecycles
- **Pattern journal**: in-memory when `TIP_WATCHLIST_STORE=memory`; **Postgres** (`pattern_instances` / `events` / `outcomes` / `statistics`) when store is `postgres` — startup hydrates multi-day opens and expires session TFs
- Auth: session cookie (`TIPSESSION`), bcrypt; **Postgres `app_users` + `cash_ledger`** when store=postgres (admin auto-seeded)
- Session expiry: short TFs expire on market close; 1h/4h track max sessions; 1d max candles
- WS: `/ws/live` subscribe, candle throttle 1s, pattern_event broadcast

## Cutover

1. Dual-run Java TIP vs Python TIP-2 with same `UPSTOX_ACCESS_TOKEN`
2. Point Vite proxy at Python `:8080`
3. Validate live session (M08–M34 in `MIGRATION.md`)

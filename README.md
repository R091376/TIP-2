# TIP-2 — Trading Intelligence Platform

Live app: [https://tip2-web.onrender.com](https://tip2-web.onrender.com)

API: [https://tip2-api.onrender.com](https://tip2-api.onrender.com)

TIP-2 is a market desk for NSE equities and the Nifty 50. It pulls live and historical prices from Upstox, builds exchange-aligned candles, detects chart patterns, and shows them on a React chart. Signed-in users can paper-trade those symbols. Nothing in this app sends orders to a broker.

The application code in this repository was generated using Claude Code.

## What it does

- **Charts.** Candlestick and line charts for a seeded watchlist (Nifty 50, RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK, HINDUNILVR, ITC, SBIN, BHARTIARTL). Default timeframe is 5 minutes. 15m, 1h, 4h, and 1d are also available. The 1-minute timeframe is off unless you turn it on.
- **Live prices.** The API keeps an Upstox market-data feed, aggregates ticks into IST candle bars, and pushes updates to the browser over a WebSocket.
- **Patterns.** Closed bars are scanned for breakout, breakdown, volume breakout, consolidation, hammer, shooting star, bullish and bearish engulfing, inside bar, higher high, lower low, double top, double bottom, head and shoulders, and inverse head and shoulders. Each detection freezes an entry, a stop, and a target, then tracks the outcome.
- **Support and resistance.** Daily Woodie pivot levels are calculated for the session and drawn on the chart.
- **Alerts and stats.** Pattern alerts appear on the chart. The Stats page summarizes how those patterns have behaved.
- **Learn.** Short explanations of the indicators and pattern rules used by the detectors.
- **Paper trading.** Logged-in users get a simulated cash account (₹1,00,000 to start), positions, and orders. Fills use live prices. An illustrative NSE equity cash charge schedule can be applied. Intraday (MIS) positions are squared off near the close. This is a simulator, not a brokerage account.
- **Backtest.** Administrators can replay pattern rules over stored history.
- **Users.** An administrator can manage accounts.

Charts, the public watchlist, market data, pattern alerts, pattern statistics, and the live socket work without signing in. Paper trading, watchlist edits, instrument search, backtests, and user administration require a login.

## How it works

```
Browser (React + Vite)
  REST  /api/...
  WS    /ws/live
        │
        ▼
FastAPI (Python)
  candle engine  →  pattern detectors  →  Postgres
  paper book     →  charge estimate
        │
        ▼
Upstox market data (historical REST + live protobuf feed)
```

1. On startup the API connects to Postgres and applies SQL migrations in `backend/db/migration`. It then loads the NSE instrument master and seeds historical candles for the watchlist.
2. The Upstox feed delivers ticks. The candle engine buckets them on IST boundaries and stores closed bars.
3. Pattern detectors run on those bars. New and updated patterns are written to the journal and broadcast to open charts.
4. The React app (Lightweight Charts) loads history over HTTP and subscribes to `/ws/live` for the current symbol and timeframe.
5. A paper order is priced from the live book, cash is locked, and a fill is recorded in Postgres. No order leaves this process.
6. Login returns a JWT access token (8 hours). The browser stores it and sends `Authorization: Bearer <token>`. The API does not use session cookies, so the split Render frontend and API work on a phone.

## Local setup

You need:

- Python 3.11 or newer
- Node.js 20.19 or newer, or Node.js 22.12 or newer
- PostgreSQL, with a database named `tip`
- An Upstox access token

### 1. Database

Create a Postgres database named `tip`.

```sql
CREATE DATABASE tip;
```

The API creates and updates tables itself the first time it connects. You do not run the SQL files by hand.

### 2. Backend environment

From the repository root:

```text
cd backend
python -m venv .venv
```

Windows:

```text
.venv\Scripts\activate
pip install -r requirements.txt
```

macOS or Linux:

```text
source .venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:

```text
UPSTOX_ACCESS_TOKEN=your_upstox_access_token
```

`scripts/start-backend.bat` always points the API at the local Postgres database named `tip`.

If the API should use a different database, set `LOCAL_DATABASE_URL` in the environment before starting.

### 3. Start on Windows

Double-click `start-tip2.bat`, or run it from a terminal in the repository root. It opens two windows:

| Script | What it starts |
| --- | --- |
| `start-tip2.bat` | API and the Vite dev server |
| `scripts/start-backend.bat` | API on port 8080 |
| `scripts/start-frontend.bat` | Vite on port 5173 |
| `scripts/stop-tip2.bat` | Processes listening on 8080 and 5173 |

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

### 4. Start manually

Backend:

```text
cd backend
.venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Frontend, in a second terminal:

```text
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Leave `VITE_API_BASE_URL` empty for local development. Vite proxies `/api` and `/ws` to `http://127.0.0.1:8080`.

### 5. Check that it is running

Health check: [http://127.0.0.1:8080/api/health](http://127.0.0.1:8080/api/health). Interactive API schema: [http://127.0.0.1:8080/docs](http://127.0.0.1:8080/docs).

## Deploy on Render

Production is two services, declared in `render.yaml` at the repository root.

| Service | Kind | Directory | URL |
| --- | --- | --- | --- |
| `tip2-api` | Python web (Uvicorn, 1 worker) | `backend/` | [https://tip2-api.onrender.com](https://tip2-api.onrender.com) |
| `tip2-web` | Static site (Vite build) | `frontend/` | [https://tip2-web.onrender.com](https://tip2-web.onrender.com) |

The API runs in the Singapore region on the free plan, with Python 3.12.8. The free web service sleeps when idle. The first request after sleep can take about a minute while Render starts it.

### First deploy

1. Push this repository to GitHub.
2. In the Render dashboard, choose **New → Blueprint** and select the repository. Render creates `tip2-api` and `tip2-web` from `render.yaml`.
3. When Render asks for secrets, set them on `tip2-api`:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Postgres URL in SQLAlchemy form, with SSL |
| `UPSTOX_ACCESS_TOKEN` | Upstox access token used for historical candles and the live feed |

`JWT_SECRET` is generated by the blueprint. Do not commit it.

The blueprint already sets:

- `TIP_WATCHLIST_STORE=postgres`
- `JWT_EXPIRE_HOURS=8`
- `CORS_ALLOWED_ORIGINS=https://tip2-web.onrender.com,http://localhost:5173`
- `TIP_TIMEFRAME_1M_ENABLED=false` and `TIP_PATTERN_SR_BACKFILL_ON_STARTUP=false` so the free instance can boot inside its memory limit
- `VITE_API_BASE_URL=https://tip2-api.onrender.com` on the static site

`VITE_*` values are baked in when the frontend is built. If you change the API host, set `VITE_API_BASE_URL` and redeploy `tip2-web`.

4. Wait until [https://tip2-api.onrender.com/api/health](https://tip2-api.onrender.com/api/health) returns UP. The API applies database migrations on startup.
5. Redeploy `tip2-web` after the API host is final, so the static build calls the right API.
6. Open [https://tip2-web.onrender.com](https://tip2-web.onrender.com).

### What talks to what

The browser loads the static site from `tip2-web`. Every `/api` call and the live socket go to `tip2-api`, using the origin compiled into the frontend. The API allows that origin through CORS. A mismatch (trailing slash, `http` instead of `https`, or a different host) makes the browser block the calls.

## Layout

```text
TIP-2/
  render.yaml                 Render services
  start-tip2.bat              Windows launcher
  scripts/                    Start and stop helpers
  backend/
    app/                      FastAPI application
    db/migration/             Postgres SQL, applied on startup
    requirements.txt
  frontend/                   React + Vite UI
```

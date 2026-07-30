# TIP-2 — Trading Intelligence Platform (Python backend migration)

Sibling project of **`../TIP`** (Java Spring Boot).

| Layer | Status |
|---|---|
| **Frontend** | React + Vite + Lightweight Charts |
| **Python backend** | FastAPI (port of TIP Java backend) |
| **Architecture** | See [`Architecture-Design-v1.0.md`](Architecture-Design-v1.0.md) |

## Why TIP-2 exists

Migrate the backend from **Java 17 / Spring Boot** to **Python 3** without changing frontend logic or public APIs. Java remains in `../TIP` as the reference implementation until cutover.

## Layout

```
TIP-2/
  README.md
  Architecture-Design-v1.0.md
  frontend/                 # React + Vite UI
  docs/                     # Product / pattern docs
  backend/
    app/                    # Python package
    tests/                  # pytest
    db/migration/           # Postgres SQL V1–V5
    proto/                  # Upstox Market Data Feed V3 .proto
    reference/
      java-config/          # application.yml oracle
      java-tests/           # 51 Java tests to port
      java-test-resources/  # fixtures
```

## Local start (Windows)

Double-click **`start-tip2.bat`** in the repo root (or run it from a terminal).

| Script | Purpose |
|--------|---------|
| `start-tip2.bat` | Opens backend + frontend in two windows |
| `scripts/start-backend.bat` | API only (`:8080`, loads `backend/.env`) |
| `scripts/start-frontend.bat` | Vite only (`:5173`, proxies to API) |
| `scripts/stop-tip2.bat` | Kills processes on ports 8080 and 5173 |

Then open **http://127.0.0.1:5173** (login `admin` / `admin` by default).

### Manual start

```text
# Backend
cd backend
python -m venv .venv
# activate, pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080

# Frontend
cd frontend
npm ci
npm run dev
```

Port **8080** and Vite proxy paths must stay aligned with `frontend/vite.config.js`.

Local backend uses **Postgres on localhost** (`postgresql+psycopg://postgres:admin@localhost:5432/tip`).  
`scripts/start-backend.bat` forces that URL so a Neon `DATABASE_URL` in `.env` is not used for local runs.  
To override: set `LOCAL_DATABASE_URL` before starting.

## Deploy on Render (split FE / API + JWT)

See **[docs/RENDER-DEPLOY.md](docs/RENDER-DEPLOY.md)** and root **`render.yaml`**.

Auth: **JWT Bearer** (8h), stored in the browser (`localStorage`). No session cookies.

Quick path:

1. Blueprint-deploy (or Sync) from this repo (`tip2-api` + `tip2-web`).
2. Set secrets: `DATABASE_URL`, `UPSTOX_ACCESS_TOKEN`; ensure `JWT_SECRET` is set.
3. Redeploy static FE so `VITE_API_BASE_URL` is baked in.
4. Login from `https://tip2-web.onrender.com` (works on mobile).

## Related

- Architecture: [`Architecture-Design-v1.0.md`](Architecture-Design-v1.0.md)
- Source Java app: `../TIP`
- Product / pattern docs: `docs/`

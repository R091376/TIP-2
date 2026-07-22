# TIP-2 — Trading Intelligence Platform (Python backend migration)

Sibling project of **`../TIP`** (Java Spring Boot).

| Layer | Status |
|---|---|
| **Frontend** | Copied from TIP — **unchanged** (React + Vite + Lightweight Charts) |
| **API / WebSocket contracts** | **Frozen** — see `contracts/API-CONTRACT.md` |
| **Python backend** | **Not implemented yet** — plan only |
| **Migration plan + tests** | `MIGRATION.md` |

## Why TIP-2 exists

Migrate the backend from **Java 17 / Spring Boot** to **Python 3** without changing frontend logic or public APIs. Java remains in `../TIP` as the reference implementation until cutover.

## Layout

```
TIP-2/
  MIGRATION.md              # Plan, phases, full test matrix
  contracts/API-CONTRACT.md # Frozen REST + WS contract
  frontend/                 # Same UI as TIP (install deps here)
  docs/                     # Product / pattern docs
  backend/
    app/                    # Python package (scaffold only)
    tests/                  # pytest targets (empty until implementation)
    db/migration/           # Postgres SQL V1–V5 (same as Java Flyway)
    proto/                  # Upstox Market Data Feed V3 .proto
    reference/
      java-config/          # application.yml oracle
      java-tests/           # 51 Java tests to port
      java-test-resources/  # fixtures
  *.md                      # Architecture & design copies
```

## Do not implement until approved

Implementation starts only when the owner explicitly says so. Until then:

- Use this repo for planning, contracts, and frontend work against Java if needed.
- To run the **current** product, use `../TIP` backend + this or TIP’s frontend.

## When implementation starts (preview)

```text
# Backend (planned)
cd backend
python -m venv .venv
# activate, pip install -r requirements.txt
# uvicorn app.main:app --host 0.0.0.0 --port 8080

# Frontend (ready to install)
cd frontend
npm ci
npm run dev
```

Port **8080** and Vite proxy paths must stay aligned with `frontend/vite.config.js`.

## Deploy on Render (split FE / API)

See **[docs/RENDER-DEPLOY.md](docs/RENDER-DEPLOY.md)** and root **`render.yaml`**.

Quick path:

1. Blueprint-deploy from this repo (creates `tip2-api` + `tip2-web`).
2. Set secrets: `DATABASE_URL`, `UPSTOX_ACCESS_TOKEN`, `CORS_ALLOWED_ORIGINS`.
3. Redeploy static FE after API URL is known so `VITE_API_BASE_URL` is baked in.

## Validation

Full automated + manual matrix: **`MIGRATION.md` §6–§7**.

## Related

- Source Java app: `../TIP`
- Decisions to preserve: `Architectural-Decisions.md`

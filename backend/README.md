# Sprout backend (MVP)

Thin Node/Express proxy in front of Open Food Facts: caches responses, retries transient failures, self-imposes a per-IP rate limit to stay a good API citizen, and collects best-effort client error logs. Not a system of record — the mobile app can call Open Food Facts directly if this service is down (see `docs/ARCHITECTURE.md`).

## Run

```bash
npm install
cp .env.example .env
npm run dev      # ts-node-dev, auto-reload
npm run build && npm start   # production
```

## Test

```bash
npm test
```

Covers success/error/retry paths for the Open Food Facts client, request validation, and the self-imposed rate limiter, using `supertest` against the Express app with a mocked `fetch` — no real network calls.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/ingredients/barcode/:code` | Proxy + cache for an Open Food Facts barcode lookup |
| GET | `/ingredients/search?q=` | Proxy + cache for an Open Food Facts free-text product search |
| GET | `/alternatives?category=&country=` | Proxy + cache for category/region-filtered alternatives |
| POST | `/logs` | Best-effort client error/event logging (`{ level, message, context? }`) |

All upstream failures return `502 upstream_unavailable` with a user-safe message rather than leaking the underlying error.

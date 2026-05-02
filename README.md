# PEA Portfolio

**Self-hosted portfolio tracker for French PEA accounts (Plan d'Épargne en Actions).**  
Track your positions, dividends, and performance in real time — without sending your data to any third-party service.

[![Version](https://img.shields.io/badge/version-0.1.25-blue)](CHANGELOG.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## Overview

PEA Portfolio is a full-stack web application designed for individual investors who hold a French PEA account. It aggregates market data from Yahoo Finance, stores everything locally in SQLite, and exposes a clean dark UI with charts, a dividend calendar, and portfolio analytics.

**Key principles:**
- **Self-hosted** — your positions and financial data never leave your server.
- **Cache-first** — Yahoo Finance is only called to refresh data; the UI always reads from local SQLite.
- **Single user** — designed for one account, no multi-tenancy overhead.
- **Privacy mode** — hide all personal figures (values, quantities, performance) with one toggle, keeping only market data visible.

---

## Features

### Portfolio
- Real-time portfolio valuation aggregated from Yahoo Finance market data
- Per-position breakdown: quantity, average buy price, current value, fees paid, dividends received
- Range performance chart (1 day → all time) with transaction markers
- Dashboard sort by name, market value, or period performance
- Watchlist alongside your positions

### Dividends
- Annual dividend estimate with monthly bar chart
- Grouped view per asset with quarterly breakdown (Q1–Q4)
- Dividend yield and yield-on-cost per position
- Historical dividend chart per asset (5 years)

### Analysis
- Portfolio treemap (weight per asset)
- Country and sector allocation pie/bar charts
- Net margin comparison across holdings
- Revenue / Net Income / Margin combo chart per company

### Asset detail
- Price history chart with all time ranges
- Market info panel: 52-week range, volume, dividend rate, ex-date
- Your position summary: value, P&L, period performance
- Yahoo Finance news articles (optional, toggleable)

### Import
- **CSV Boursorama** — preview before import, correctable rows, merge or replace existing positions
- **PDF avis opérés** — parse broker trade confirmations, editable preview, timestamped transactions

### Settings
- Privacy mode: replace all personal figures with `••••` across every page
- Default dashboard sort and chart range
- Local PEA search to limit API calls
- Yahoo Finance news toggle and language selection (FR / EN)
- Profile icon upload
- Asset icon management

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS 4, Recharts, React Router 7 |
| Backend | Node.js, Express 5, TypeScript |
| Database | SQLite via `better-sqlite3` |
| Market data | `yahoo-finance2` (rate-limited, cache-first) |
| Auth | Cookie session (`httpOnly`), bcryptjs password hashing |
| Validation | Zod |
| Deployment | Docker multi-stage build, docker-compose |

---

## Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10
- or **Docker** + **Docker Compose** for containerised deployment

---

## Quick Start (Development)

```bash
# 1. Clone the repository
git clone https://github.com/your-username/pea-portfolio.git
cd pea-portfolio

# 2. Copy environment file
cp .env.example .env

# 3. Install dependencies (monorepo)
npm install

# 4. Start backend + frontend concurrently
npm run dev
```

| Service | URL |
|---|---|
| Frontend (Vite) | http://localhost:5173 |
| Backend API | http://localhost:4000 |

On first launch, the app prompts you to create a local account (username + password). All subsequent logins use that credential.

### Individual services

```bash
npm run dev:backend    # backend only (port 4000, tsx watch)
npm run dev:frontend   # frontend only (port 5173, Vite HMR)
```

### Useful scripts

```bash
npm run build          # compile all workspaces (shared → backend → frontend)
npm run typecheck      # type-check all workspaces without emitting
npm run lint           # ESLint across backend, frontend, shared
npm run test           # run all test suites
npm run cache:clear    # wipe Yahoo Finance market data cache
npm run dev:clear      # clear cache then start dev servers
```

---

## Production (Docker)

```bash
docker compose up --build
```

The application is available at **http://localhost:4000**.  
The SQLite database and uploaded icons are persisted in the `./data` volume.

### docker-compose.yml snippet

```yaml
services:
  pea:
    build: .
    ports:
      - "4000:4000"
    volumes:
      - ./data:/app/data
    environment:
      NODE_ENV: production
      PORT: 4000
      SQLITE_PATH: /app/data/pea.sqlite
```

---

## Environment Variables

Copy `.env.example` to `.env` and adjust as needed.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Express server port |
| `SQLITE_PATH` | `./data/pea.sqlite` | Path to the SQLite database file |
| `APP_TIMEZONE` | `Europe/Paris` | Timezone used for market session calculations |
| `FRONTEND_DIST` | `../frontend/dist` | Path to the built frontend (production) |
| `VITE_API_BASE_URL` | `http://localhost:4000` | API base URL used by Vite dev proxy |
| `WAIT_FOR_HEALTH_TIMEOUT_MS` | `30000` | Timeout for the dev health-check script |
| `LOGO_DEV_API_KEY` | *(optional)* | API key for automatic asset logo fetching |
| `DEBUG` | `false` | Enable verbose backend logging |
| `DEBUG_DATE` | *(optional)* | Override current date for testing (ISO string) |

---

## CI / CD (Gitea)

The workflow `.gitea/workflows/docker-release.yml` runs on every push and on manual dispatch:

1. Installs dependencies (`npm ci`)
2. Runs `typecheck` and `build`
3. Builds the Docker image from `backend/Dockerfile`
4. On manual trigger: bumps the version (`patch` / `minor` / `major`), commits, and creates a `vX.Y.Z` tag
5. Publishes the image when `publish=true` or when the workflow runs on a `v*` tag

**Required Gitea secrets:**

| Secret | Description |
|---|---|
| `DOCKER_REGISTRY` | Registry host without protocol (e.g. `registry.example.com/my-org`) |
| `DOCKER_USERNAME` | Registry username |
| `DOCKER_PASSWORD` | Registry password or token |

---

## API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/setup` | Create the first account |
| `POST` | `/api/auth/login` | Authenticate |
| `POST` | `/api/auth/logout` | Invalidate session |
| `GET` | `/api/auth/me` | Get current user + preferences |
| `PATCH` | `/api/auth/me` | Update preferences (sort, range, privacy mode…) |
| `POST` | `/api/auth/me/profile-icon` | Upload profile picture |
| `DELETE` | `/api/auth/me/profile-icon` | Remove profile picture |

### Portfolio
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/portfolio` | Portfolio summary (total value, positions) |
| `GET` | `/api/portfolio/chart?range=` | Portfolio value chart data |
| `GET` | `/api/portfolio/performance?range=` | Per-position range performance |
| `GET` | `/api/portfolio/dividends` | Dividends grouped by asset + monthly estimates |
| `GET` | `/api/portfolio/analysis` | Country/sector allocation, treemap, financials |
| `POST` | `/api/portfolio/positions` | Add a position |
| `PATCH` | `/api/portfolio/positions/:id` | Update a position |
| `DELETE` | `/api/portfolio/positions/:id` | Remove a position |

### Market data
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/assets/:symbol` | Asset detail (quote, chart, dividends, position) |
| `GET` | `/api/assets/:symbol/icon` | Asset logo |
| `POST` | `/api/assets/:symbol/icon` | Upload custom asset logo |
| `DELETE` | `/api/assets/:symbol/icon` | Reset asset logo |
| `GET` | `/api/search?q=` | Search assets (Yahoo or local PEA list) |
| `GET` | `/api/market/top-movers` | Daily gainers and losers |

### Import
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/import/boursorama/preview` | Preview CSV Boursorama import |
| `POST` | `/api/import/boursorama/confirm` | Confirm CSV import |
| `POST` | `/api/import/avis-operes/preview` | Preview PDF avis opérés |
| `POST` | `/api/import/avis-operes/confirm` | Confirm PDF import |

---

## Market Data

The backend follows a **cache-first** strategy:

- All requests from the frontend go to the local backend only — no direct calls to Yahoo Finance from the browser.
- The backend reads from SQLite first; Yahoo Finance is called only to refresh stale or missing data.
- Quotes, historical prices, dividends, and fundamentals are all cached in SQLite.
- The intraday `1d` view uses `yahooFinance.chart` at `2m` intervals, bounded to the current or last Euronext Paris session.
- Yahoo Finance calls are rate-limited via Bottleneck (`maxConcurrent=1`, `minTime=250ms`) with exponential-backoff retries.
- On `429`, `401`, crumb errors, or `Too Many Requests`, the backend falls back to the last cached data and marks responses as `stale`.
- Stale data is surfaced visually in the UI as "Données différées".
- The market data layer is abstracted behind `MarketDataProvider`, making it straightforward to swap Yahoo Finance for another provider (EODHD, Twelve Data, Alpha Vantage…).

### Yahoo Finance limitations

Yahoo Finance does not guarantee exhaustive dividend coverage or future calendars for all securities. The app uses real dividends when available and estimates future payments from the prior year's data when no reliable forward data exists.

PEA eligibility shown in search results is computed locally using symbol, exchange, and ISIN heuristics — it is not verified by Yahoo Finance and is displayed with a confidence level accordingly.

---

## Project Structure

```
pea-portfolio/
├── backend/              # Express API + SQLite
│   ├── src/
│   │   ├── routes/       # API route handlers
│   │   ├── services/     # Business logic (auth, portfolio, yahoo, …)
│   │   ├── middleware/   # Auth, rate limiting, CORS
│   │   ├── db.ts         # SQLite adapter
│   │   ├── db-migrations.ts
│   │   └── server.ts
│   └── Dockerfile
├── frontend/             # React + Vite SPA
│   └── src/
│       ├── components/   # Reusable + feature UI components
│       ├── contexts/     # React contexts (PrivacyContext, …)
│       ├── hooks/        # Custom hooks
│       ├── lib/          # API client, formatting, privacy helpers
│       ├── pages/        # Route-level page components
│       └── utils/        # Asset tone, misc helpers
├── shared/               # Shared TypeScript types (DTOs)
├── scripts/              # Dev helper scripts
├── data/                 # SQLite db + profile icons (gitignored)
├── docker-compose.yml
└── .env.example
```

---

## Contributing

Contributions are welcome. Before opening a pull request:

1. Fork the repository and create a branch from `main`.
2. Run `npm run typecheck` and `npm run lint` — both must pass.
3. If you add a feature that touches the database schema, add a migration in `backend/src/db-migrations.ts`.
4. Write or update tests where appropriate (`npm run test`).
5. Keep commits focused and write clear commit messages.

---

## License

MIT — see [LICENSE](LICENSE) for details.

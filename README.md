# SE Inventory — Stock Opname App

Web app + API for periodic physical stock counts (Stock Opname) across multiple store locations. Covers the full lifecycle: manager initiates a session → staff submit counts → manager reviews and approves/rejects → stock is updated.

## Tech Stack

Monorepo: `backend/` (API) and `frontend/` (web app).

| Layer    | Technology                                                    |
| -------- | ------------------------------------------------------------- |
| Backend  | Express.js (JavaScript), `pg`, `node-pg-migrate` (SQL migrations) |
| Database | PostgreSQL 17 (Docker Compose)                                |
| Frontend | React 19, Vite, React Router, Tailwind CSS v4                 |
| Auth     | JWT access token (8h), bcrypt password hashing                |

## Features

- Product master data with SKU and per-store stock quantity
- Authentication with two roles: **Store Staff** and **Store Manager**
- Manager: initiate session (per store, with stock snapshot), review submitted counts, approve / reject with a reason
- Staff: submit counts for their own store's session (single batch, partial counts allowed, blind count)
- Submission history kept per session; staff can resubmit until the manager approves, and the staff UI warns before replacing an already-counted item
- Stock is only changed on approval, in a single database transaction, with a stock movement ledger for audit
- Approve is blocked (`409 STOCK_CHANGED`) when stock changed since the snapshot, until the manager explicitly confirms
- Manager dashboard with total stock across stores
- Responsive UI with role-based views
- TODO: extras (e.g. bulk upload via CSV)

## Roles

| Role          | Can do                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| Store Staff   | Belongs to one store; enter and submit counts for that store (blind count: system stock is never shown) |
| Store Manager | Start sessions, review submissions (system vs counted vs difference), approve or reject |

## Stock Opname Flow

```
open ──submit──▶ submitted ──approve──▶ approved (final, stock updated)
  ▲                  │
  └──── reject ──────┘   (reason required, stock unchanged, old submission kept as history)
```

1. **Initiate** — manager starts one session per store; current stock is copied as a snapshot.
2. **Submit** — staff count some or all items. Empty = not counted (stock unchanged); `0` = counted, out of stock. Duplicate SKUs in one batch are rejected.
3. **Review** — manager sees snapshot, counted quantity and difference per item; uncounted items are flagged.
4. **Approve / Reject** — approve sets stock directly to the counted quantity and writes stock movement records atomically; reject returns the session to `open`.

## Getting Started

### Prerequisites

- Node.js 20.6 or newer (the scripts use `node --env-file`)
- Docker (for PostgreSQL), or your own PostgreSQL 16+ instance

### Setup

```bash
# 1. Clone
git clone <repo-url>
cd se-inventory

# 2. Start PostgreSQL via Docker (skip if you run your own instance)
docker compose up -d      # DB se_inventory, user/password postgres/postgres, host port 5433

# 3. Backend (API on http://localhost:3000)
cd backend
cp .env.example .env
npm install
npm run migrate           # create tables
npm run seed              # demo stores, products, stock and accounts (safe to re-run)
npm run dev

# 4. Frontend (in a second terminal, http://localhost:5173)
cd frontend
cp .env.example .env
npm install
npm run dev
```

If port 5173 is already taken, Vite silently picks the next free one (5174, ...). Check the URL it prints.

### Environment variables

`backend/.env`

| Variable         | Purpose                                                      |
| ---------------- | ------------------------------------------------------------ |
| `PORT`           | API port (default `3000`)                                    |
| `DATABASE_URL`   | PostgreSQL connection string; must match `docker-compose.yml` (host port `5433`) |
| `JWT_SECRET`     | Secret used to sign tokens. Use a long random value outside local dev |
| `JWT_EXPIRES_IN` | Token lifetime (default `8h`)                                |

`frontend/.env`

| Variable         | Purpose                                                      |
| ---------------- | ------------------------------------------------------------ |
| `VITE_API_PROXY` | Backend URL that the Vite dev server forwards `/api` to. Must match the backend `PORT` |

### Useful commands

| Command (in `backend/`)  | What it does                          |
| ------------------------ | ------------------------------------- |
| `npm run migrate`        | Apply pending migrations              |
| `npm run migrate:down`   | Roll back the last migration          |
| `npm run seed`           | Insert demo data (existing rows untouched) |

### Demo accounts

| Role    | Email | Password |
| ------- | ----- | -------- |
| Manager | manager@example.com   | password123 |
| Staff (Jakarta) | staff.jkt@example.com | password123 |
| Staff (Bandung) | staff.bdg@example.com | password123 |

## API Overview

All endpoints except `/health` and `POST /auth/login` need `Authorization: Bearer <token>`.

| Method & path                     | Role    | Purpose                                                        |
| --------------------------------- | ------- | -------------------------------------------------------------- |
| `POST /auth/login`                | public  | Email + password, returns a JWT                                |
| `GET /auth/me`                    | any     | Current user                                                   |
| `GET /stores`                     | any     | Stores (staff: own store only) with their active session       |
| `GET /products?q=`                | manager | Products with stock per store and total                        |
| `GET /dashboard`                  | manager | Total stock, units per store, sessions waiting for review      |
| `POST /sessions`                  | manager | Start a session for one store (`{ storeId, note }`), snapshots stock |
| `GET /sessions?status=&storeId=`  | any     | List sessions (staff: own store only)                          |
| `GET /sessions/:id`               | any     | Session detail, items, submission history. Staff never receive system quantities |
| `POST /sessions/:id/cancel`       | manager | Cancel an open / submitted session                             |
| `POST /sessions/:id/submissions`  | staff   | Submit counts (`{ items: [{ sku, countedQty }] }`); resubmitting replaces the pending one |
| `POST /sessions/:id/approve`      | manager | Set stock to counted quantities. If stock changed since the snapshot, returns `409 STOCK_CHANGED` until called with `{ confirmStockChanged: true }` |
| `POST /sessions/:id/reject`       | manager | `{ reason }` required; session returns to `open`               |

## Project Structure

```
se-inventory/
├── docker-compose.yml         # PostgreSQL
├── backend/
│   ├── migrations/            # SQL schema (node-pg-migrate)
│   ├── scripts/seed.js        # demo data
│   └── src/
│       ├── app.js, index.js, db.js   # express app, entry point, pool + withTransaction()
│       ├── middleware/auth.js        # requireAuth, requireRole
│       └── routes/                   # auth, stores, products, dashboard, sessions, review (approve/reject)
├── frontend/
│   └── src/
│       ├── api.js, auth.jsx          # fetch wrapper, auth context
│       ├── components/               # Layout, RequireRole, Dialog, StatusBadge
│       └── pages/                    # Login, staff/*, manager/*
├── NOTES.md                   # design decisions
└── README.md
```

### Data model (summary)

`stores`, `users` (staff belong to a store, managers to none), `products`, `store_stock` (live stock per store), `stock_sessions`, `session_items` (stock snapshot), `submissions` + `submission_items` (only counted items have a row), `stock_movements` (ledger written on approval). Database constraints back the business rules: one active session per store, one pending submission per session, counted items must exist in the session snapshot.

## Documentation

- Design decisions and edge cases: see [NOTES.md](./NOTES.md)
- Original brief: `docs/Take-Home Technical Assessment_ Stock Opname App V4.pdf`

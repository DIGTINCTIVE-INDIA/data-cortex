# Data Cortex

A data-quality platform: define what good data looks like, check databases and files against it,
and see what failed, who it affects and what was done about it.

| folder | what it is | runs on |
|---|---|---|
| `frontend/` | the web app (React Router + Vite) | http://localhost:5173 |
| `backend/` | the API, a pnpm/turbo monorepo (`apps/core-server`, `packages/@repo/*`) | http://localhost:3000 |
| `dc-engine/` | the check engine (Python, Celery, Redis) that runs checks | http://localhost:8000 (Docker) |
| `artifacts/` | the cross-repo sync gate (`check_sync.sh`), migrations, deploy test | — |
| `db-watch/` | a small live Postgres table viewer for development | http://localhost:7070 |

## What you need

- **Node 22 or newer** and **pnpm 10.28.2** (`corepack enable` picks the pinned version)
- **Docker Desktop** (the engine and its Redis run in containers)
- A **PostgreSQL** database the backend and engine can both reach
- The **environment files**, which are not in this repository (see below)

## Environment files

Nothing secret is committed. You are given these separately and place them yourself:

| file | holds |
|---|---|
| `backend/.env` | database URL, token secrets, Azure sign-in, SMTP, encryption key, engine URL and callback secret |
| `dc-engine/.env` | database and results-schema settings, encryption keys, optional S3 and Snowflake |
| `frontend/.env` | `VITE_ENV` and `VITE_BACKEND_URL` (local: `http://localhost:3000`). Committed: it holds no secret. A deployed build sets `VITE_BACKEND_URL` in its build environment instead. |

Each folder has a `.env.example` listing the names its `.env` needs (values blank). `backend/.env.demo` is a demo-data set (Postgres, S3, Snowflake) for the test connections.

The backend and the engine **must use the same `ENCRYPTION_SECRET_KEY`**, because connection
passwords stored in the database are encrypted with it.

## First run

```bash
# 1. dependencies
cd backend  && pnpm install && cd ..
cd frontend && pnpm install && cd ..

# 2. database: create the tables, then seed the check types, categories and the first admin
cd backend
pnpm db:push
pnpm db:init          # asks for the first admin's email and name

# 3. the engine (its own folder)
cd ../dc-engine
docker compose up -d --build

# 4. the backend, then the frontend (two terminals)
cd ../backend  && pnpm dev
cd ../frontend && pnpm dev
```

When the backend starts it prints whether all tables exist and whether an admin user exists, and
says how to fix either.

Sign-in is **Microsoft Entra ID only**. The email you give `db:init` must be the one you sign in
with, and the Azure app registration must list `http://localhost:5173` as a redirect URI.

## Sharing your running copy on the same network

`pnpm dev` already listens on the network. Open `http://<your-ip>:5173/` from the other machine:
the page calls its own address, and the dev server forwards `/api` to the backend on port 3000.
Sign-in still redirects to the address registered in Azure.

## Setting up test data through the API

`backend/api-tests/setup.ts` creates a full set of test connections, checks and users using only the HTTP API
(nothing is read from the database or from internal code), so it exercises the same path as the UI.

```bash
cd backend
cp api-tests/.env.example api-tests/.env     # then fill it in; every value is a TEST_* variable
pnpm api:setup                               # core-server must be running on :3000
```

It creates 2 Postgres, 2 Snowflake and 1 S3 connection; database checks and custom SQL checks for
SF to SF, PG to PG, SF to PG and PG to SF; file checks from S3 to Postgres and Snowflake; an engineer, an analyst
and a service user; and fires one check with the service key. It checks no results: it prints the IDs it
created and you look at them yourself. Each run adds new items with a fresh suffix, so running it twice
duplicates them. Snowflake steps need `TEST_SF_PRIVATE_KEY`, or existing connection IDs in
`TEST_SF_SOURCE_CONNECTION_ID` / `TEST_SF_TARGET_CONNECTION_ID`. If Snowflake is a production account, only
configuration is created and no Snowflake run is fired. The service user's key is saved to
`backend/api-tests/service-key.txt` (git-ignored).

## Checking that everything agrees

```bash
bash artifacts/check_sync.sh
```

Typechecks all three parts, compares the code's table definitions and the engine's models with the
live database, runs the engine's tests, builds a throwaway database from nothing, and exercises the
access rules over HTTP (needs the backend running). `QUICK=1` skips the slow steps.

A full end-to-end run through the real API, engine and databases (Postgres, Snowflake, S3) is
`backend/packages/@repo/dao/src/scripts/e2e-matrix.ts`; it writes to live databases, so it is
not part of the gate. `e2e-cleanup.ts` removes anything it leaves behind.

## Machine-specific notes

- `.npmrc` is git-ignored on purpose. On the original machine it points pnpm's virtual store outside
  OneDrive (`virtual-store-dir=...`); you do not need it, and its Windows path would be wrong on yours.
- Roles: **admin** (everything), **engineer** (configure connections, checks and email), **analyst**
  (run checks, see dashboards, alerts and reports); everyone can use the read-only Database Explorer.
  A **service** user is an API-key identity (for Airflow) that can only start check runs.

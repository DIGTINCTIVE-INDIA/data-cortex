# Run Button → Backend → dc-engine

Status as of 2026-10-08.

> **Superseded design.** This wiring originally called Airflow's REST API directly, with
> a local `trigger.py` subprocess as a fallback. Both are gone. The backend now makes a
> plain HTTP call to dc-engine, and the backend is the only caller of that engine.

## The flow

```
Run button (React)
  └─ POST /api/qc-configuration/run      { configId, source }
       └─ core-server: QCRunController.runCheck
            └─ POST {DC_ENGINE_URL}/v1/runs
                 { user_id, config_id, check_type, checklist }
                 → 202 { run_id, state: "QUEUED" }
                 → Celery → worker → dc_engine
```

A single route serves every caller — the UI and a customer's Airflow alike. There is no
separate Airflow route; the payload is the payload.

---

## 1. Backend

### Files

| File | Purpose |
|---|---|
| `apps/core-server/src/routes/qc-configuration/run/run.validator.ts` | vine body schema: `configId`, `source` |
| `apps/core-server/src/routes/qc-configuration/run/router.ts` | `POST /` behind `onlyAdmin()` |
| `apps/core-server/src/routes/qc-configuration/run/run.controller.ts` | submits the run to dc-engine |
| `apps/core-server/src/routes/qc-configuration/router.ts` | **+2 lines** — one import, one `router.use("/run", …)` |

### Auth

Inherits `AuthMiddlewares.validateAccessToken` from the `/api/qc-configuration` mount in
`routes/server.ts`, plus `onlyAdmin()`. Matches every sibling mutation route.

`user_id` is taken from `req.user.id` — **never** from the request body. The engine
rejects a run at execution time if that uuid is not a real user.

### Source → check type

| `source` sent by the button | engine `check_type` |
|---|---|
| `db` | `traditional` |
| `file` | `traditional` |
| `custom-sql` | `custom_check` |

For custom checks the key stays `config_id`, not `check_id` — the engine renames it
internally. This is the opposite of the old subprocess contract, where the custom path
required `check_id` and rejected `config_id`.

### Request to the engine

```
POST {DC_ENGINE_URL}/v1/runs
{ "user_id": "<uuid>", "config_id": "DBC0001", "check_type": "traditional", "checklist": "default" }

202 { "run_id": "<uuid>", "state": "QUEUED", "submitted_at": 1791367164.21 }
```

`checklist` is currently ignored downstream but is part of the contract.

### This is asynchronous

The POST returns in milliseconds; the run itself takes seconds to minutes. **A 202 means
"accepted", never "passed."** The outcome is only available by polling the engine:

```
GET {DC_ENGINE_URL}/v1/runs/{run_id}
→ { "run_id": "...", "state": "PENDING|STARTED|SUCCESS|FAILURE", "result": {...} | "error": "..." }
```

`PENDING` means queued *or unknown* — Celery cannot distinguish an unstarted task from a
nonexistent one, so it is not proof the run exists.

**Not yet built:** the backend does not store `run_id` or poll for status, and the UI has
no queued → running → done progression. Today the run id is only surfaced in a toast.

### Response to the frontend

```
202 Accepted
{ type: "mutation", success: true,
  data: { runId: string, state: string },
  toast: { message: "Check queued" } }
```

### Failure handling

There is deliberately **no fallback**. If the engine cannot take the run, the request
fails and says why, rather than silently running elsewhere and reporting success.

| Condition | Response |
|---|---|
| unreachable / DNS / 5s timeout | `503` The check engine is unreachable. The check was not started. |
| `404` from engine | `502` no run endpoint at this address |
| `422` from engine | `502` rejected the run payload |
| other non-2xx | `502` rejected the run (HTTP n) |
| 2xx but no `run_id` | `502` did not return a run id — the run may or may not have started |

---

## 2. Configuration

Monorepo root `.env`, read via `process.env` so `@repo/env`'s schema is untouched:

```
DC_ENGINE_URL = http://127.0.0.1:8000
```

**`127.0.0.1`, not `localhost`.** dc-engine binds IPv4 only, while `localhost` resolves to
`::1` first on Windows — producing `ECONNREFUSED ::1:8000` before anything reaches the
engine. This cost real debugging time; don't change it back.

Read inside the request handler, not at module load, so a deployment that has not set it
still boots and serves every other route. Defaults to `http://127.0.0.1:8000` if unset.

### Retired keys

`DC_AIRFLOW_URL`, `DC_AIRFLOW_DAG_ID`, `DC_AIRFLOW_USER`, `DC_AIRFLOW_PASSWORD`,
`DC_ENGINE_PATH`, `DC_PYTHON_BIN` — all dead. The first four belonged to the direct-Airflow
call; the last two to the `trigger.py` subprocess. Previous values are in
`.env.bak-before-engine-keys`.

### Security

dc-engine is bound to `127.0.0.1:8000` and **has no authentication of its own**. It accepts
a payload and runs SQL against your databases. The backend must be its only caller — never
expose it to the internet. All authn/authz/tenancy stays in the backend.

---

## 3. Frontend

`frontend`, branch `dev`.

| File | Change |
|---|---|
| `…/configured-quality-checks/useRunCheck.ts` | **new** — shared hook: fires the run, reports the outcome |
| `…/components/DataConformList.tsx` | two Run buttons — `db` and `file` |
| `…/components/SqlCheckList.tsx` | one Run button — `custom-sql`, passes `item.checkId` |
| `app/lib/useApi/apis/qcConfiguration.config.ts` | endpoint + `RunCheckMutationBody` |
| `app/lib/useApi/configs/api.endpoints.ts` | registered under `qcConfiguration` |

Buttons use the `Button` component's own `isLoading` (spinner + `aria-busy`) and flip their
label to `Running…`. Each card holds its own pending state, so only the clicked row spins.

Toasts, via `sonner`:

```
queued  → "DBC0001 queued"            Run id: 4b50f644-891f-4ca9-8a42-5163424085c0
failed  → "Could not start DBC0001"   <the backend's own message>
```

The error toast surfaces the backend's real `message`, so a misconfiguration says what is
wrong instead of failing silently.

---

## 4. Verification

| Check | Status |
|---|---|
| Backend `tsc --noEmit` | ✅ 0 errors |
| Frontend `tsc --noEmit` | ✅ 11 pre-existing, **0** in these files |
| Prettier (backend) | ✅ |
| Engine health | ✅ `{"status":"ok","broker":"up"}` |
| Submit reaches the engine | ✅ `202 { run_id, state: "QUEUED" }` |
| Engine executes and validates | ✅ run reached `FAILURE` with `user_id '1111…' does not exist -- job blocked` |
| Real browser click | ❌ never performed |
| Status polling / progress UI | ❌ not built |

The `FAILURE` above is a **pass** for the wiring: a deliberately fake uuid was rejected by
the engine at execution time, proving backend → engine → Celery → user validation all work.
A real session user supplies a real `user_id`.

---

## 5. Rollback

```bash
rm -rf apps/core-server/src/routes/qc-configuration/run
git checkout -- apps/core-server/src/routes/qc-configuration/router.ts
cp .env.bak-before-engine-keys .env
```

No schema change, no migration, no dependency added, no existing handler modified, no
change to `@repo/env`. If `run/` stays but the two router lines are reverted, the endpoint
404s and nothing else notices — the halves roll back independently.

---

## 6. Local machine note — pnpm install inside OneDrive

Not part of this wiring; recorded because it cost hours and will recur.

`pnpm install` repeatedly failed while `node_modules` sat in the synced OneDrive tree.
Measured: **28 read ops/sec** (a local SSD does 100,000+), `OneDrive.exe` holding 13,342s of
CPU, and one run that populated the 1081-package store in 11 seconds then wedged for 30
minutes without writing a byte.

Fix, no admin required — a **local, untracked** `.npmrc`:

```
virtual-store-dir=C:\Users\n.rajan\pnpm-vstore\data-cortex-monorepo
```

Read throughput went 28/sec → 192/sec; the frontend install went 24 min → **2m30s**.
`.npmrc` and `node_modules.old` are excluded via `.git/info/exclude`, not `.gitignore`, so
this machine-specific workaround leaves no trace in the repo. The durable fix is to move
the repo out of OneDrive.

---

## 7. Open items

- **Status polling.** Backend stores no `run_id`; UI has no queued → running → done.
- **Schema ownership.** Drizzle and the engine's SQLAlchemy both define tables in
  `data_cortex_dev` and disagree. A `drizzle-kit push` can drop columns the engine needs
  (e.g. `custom_business_checks_config.source_table_name`, which Drizzle does not declare).
  **Do not `db:push` without coordinating with the engine side.**

# ERD alignment — monorepo

**Date:** 2026-10-06
**Anchor:** dbdiagram.io "Latest DC ERD" (`v1_dbdiagram_erd.dbml`)
**Scope:** `data-cortex-monorepo` only, on `main` as checked out. Pipeline backend out of scope.
**Target:** a **fresh database built from the schema files**. The existing dev RDS is not a consideration.

The monorepo deviated from the approved ERD in 18 places. All 18 are resolved:
**2 by changing the monorepo, 16 by amending the ERD.**

Alignment was then carried through the operations layer, not just the schema files — four further
changes were needed so the code agrees with the schema it sits on.

---

## Summary

| # | Deviation | Resolved by | Status |
|---|---|---|---|
| M1 | `qc_tags.tag_type` → `type` | Monorepo | Done |
| M2 | `qc_tags.tag_title` → `title` | Monorepo | Done |
| A1 | `database_connection.host` nullability | ERD | Done |
| A2 | `database_connection.port` nullability | ERD | Done |
| A3–A6 | 12 audit columns across 4 tables | ERD | Done |
| A7 | `impacted_downstream` FK annotated | ERD | Done |

Plus four code-alignment fixes (C1–C4) and one defect (D1), below.

**Verification:** `@repo/types`, `@repo/db` and `core-server` all typecheck clean.

---

## Changed in the monorepo

### M1 — `qc_tags.tag_type` → `type`
### M2 — `qc_tags.tag_title` → `title`

**Deviation.** The ERD specifies `type` and `title`. The monorepo shipped `tag_type` and `tag_title`.

**Why the monorepo moved.** The ERD name is already what the rest of the system speaks. `AddQcTagPayload` uses `type` and `title`; `libraries.repo.ts:20-21` maps them onto the Drizzle properties. The API, the frontend and the ERD all agreed — only the two column strings disagreed.

**Files changed.**

| File | Change |
|---|---|
| `packages/@repo/db/src/schema/libraries.schema.ts` | 2 column-name strings |
| `packages/@repo/dao/src/lib/reports/reports.repo.ts` | 12 raw-SQL references |
| `packages/@repo/dao/src/lib/dashboard/dashboard.repo.ts` | 5 raw-SQL references |
| `packages/@repo/dao/src/lib/analyse-workstream/analyse-workstream.repo.ts` | 2 raw-SQL references |

The Drizzle **properties** `tagType` / `tagTitle` are unchanged, so every query-builder call site was unaffected. Only raw SQL needed editing — all 19 references were alias-qualified (`q.`, `ds.`, `ws.`, `category.` …), making the replacement exact.

**Not changed:** the PostgreSQL enum *type* `qc_tag_type` (`pgEnum("qc_tag_type", …)`). That is a type name, not a column, and the ERD does not specify it.

**Verification.** `grep -rn "tag_title\|tag_type"` across `packages/` and `apps/` returns only the `qc_tag_type` enum declaration.

---

## Code alignment — schema vs. operations

These are not ERD deviations. They are places where the code disagreed with the schema it runs on, and would misbehave against a database built from the schema files.

### C1 — `@repo/dao` had no `tsconfig.json`

It was the only package with a `typecheck` script and no config, so `tsc --noEmit` had nothing to configure, printed its help text and exited 1. **The entire operations layer could not be typechecked.**

Added `packages/@repo/dao/tsconfig.json`, identical in form to `@repo/lib`:

```json
{
	"extends": "typescript-config/tsconfig.node.json",
	"compilerOptions": { "baseUrl": "./src" },
	"include": ["src/**/*.ts"]
}
```

`typescript-config` was already a devDependency; only the file was missing.

### C2 — `DBExplorerConnection.additionalParams` typed as a string

`packages/@repo/types/src/db-explorer/types.ts` declared:

```ts
additionalParams?: string | null;
```

But the column is **jsonb**, every other payload models it as an object (`ConnectionAdditionalParam = { ssl: boolean }`), and `ConnectionsModule.getPostgresInstance` reads `payload.additionalParams?.ssl`. A string would never have an `.ssl` property.

Changed to `ConnectionAdditionalParam | null`.

### C3 — `TestConnectionPayload.additionalParams` not nullable

`additional_params` is a **nullable** jsonb column, so rows read from the database carry `null`. The payload type allowed only `ConnectionAdditionalParam | undefined`, so a row could not be passed to `getPostgresInstance`.

Changed to `ConnectionAdditionalParam | null`. `getPostgresInstance` already handled it — `payload.additionalParams?.ssl ?? true` works on null.

C2 and C3 together fix `db.explorer.repo.ts:72`, which had been failing to compile.

### C4 — unused parameter in `SessionFactory`

`packages/@repo/lib/src/session-module/index.ts:22` — `SessionFactory(type: …)` never reads `type`, because the redis branch is commented out. With `noUnusedParameters: true` this was a hard error that kept `core-server` from compiling.

Renamed to `_type`. Signature arity and types are unchanged; the single caller (`container.ts:19`, positional) is unaffected. The commented-out redis branch is untouched.

---

## Amended in the ERD

Amended file: **`v5_dbdiagram_erd_amended.dbml`** — paste into dbdiagram.io. Every change marked `[AMENDED]` inline.

### A1 — `database_connection.host` → NOT NULL
### A2 — `database_connection.port` → NOT NULL

**Deviation.** ERD had both nullable; the monorepo has both `NOT NULL`. The Drizzle source even carries `//Host and Port are nullable in erd`, so this was a conscious departure.

**Why the ERD moved.** The nullable design anticipated Snowflake, which identifies by account rather than host and port. **Snowflake is not implemented** — `db.explorer.repo.ts:130` throws `501 not implemented yet`. MySQL is likewise declared but unbuilt.

Nullable columns today would allow saving a connection with no host that no working code path can open, and would require null-handling across six files as dead code guarding an unbuilt feature.

**Revisit when Snowflake lands.** The right change then is not nullable columns but conditional validation by `database_type` — required for postgres and mysql, optional for snowflake.

### A3–A6 — 12 audit columns added to the ERD

| Table | Columns added |
|---|---|
| `traditional_checks_library` | `user_id`, `enabled`, `created_at`, `updated_at` |
| `traditional_config_details` | `enabled`, `user_id`, `created_at`, `updated_at`, `deactivated_at` |
| `qc_tags` | `user_id` |
| `results` | `created_at`, `updated_at` |

**Why the ERD moved.** These carry user attribution and soft-delete, and are in use. Removing them would break `user.repo.ts` and every `enabled` filter.

**Origin.** Added by Asad Ansari in `640f701` (2026-05-20), originally nullable. Tightened to `NOT NULL` by Shariya Zaidi in `f4446f0` (2026-06-16) and `6a2f7ce` (2026-06-18).

**Open question for Asad.** `traditional_config_details` and `results` carry a `// needs to be verified` comment above these columns in his source. Worth confirming now that they are in the anchor.

### A7 — `impacted_downstream` foreign keys annotated

**Not a deviation — a limitation in the plan itself.** The ERD draws `qc_tags.id < …impacted_downstream` on four tables. That column is an integer **array** in every implementation, and PostgreSQL cannot place a foreign key on an array element. The refs are kept, now annotated as design intent, so future reviews do not re-file them as a bug.

---

## Fixed defect

### D1 — `init-db.ts` queried a non-existent column

`packages/@repo/db/src/scripts/init-db.ts:54` read `WHERE deleted_at IS NULL`. The `users` table has `deactivated_at`; there is no `deleted_at`. Every `pnpm db:init` raised `column "deleted_at" does not exist` and exited 1 — **first-admin setup was impossible on any database, including a fresh one.**

Changed to `deactivated_at`. The only reference to this script is the `db:init` entry in `package.json`.

**Open question for Asad.** `deactivated_at IS NULL` means "currently enabled", not "not deleted" — `user.repo.ts:170` sets that column when a user is *disabled* and clears it when re-enabled. If every user is disabled the count returns 0 and `db:init` creates another "first admin", despite printing *"Initial setup is allowed only once."* That may be intended as lockout recovery. The minimal fix was applied; the behaviour was not changed.

---

## Remaining — one item, needs an install

### `@repo/dao` is missing `@types/express-fileupload`

`@repo/dao` standalone reports two errors:

```
../lib/src/validation-module/index.ts(122,22): Property 'files' does not exist on type 'Request<...>'
../lib/src/validation-module/index.ts(149,8):  Property 'files' does not exist on type 'Request<...>'
```

`req.files` comes from `@types/express-fileupload`, which augments `Express.Request`. `@repo/lib` declares it; `@repo/dao` does not. Because every package exports raw source (`"exports": "./src/index.ts"`), dao compiles lib's TypeScript directly and needs the same ambient types.

**These are pre-existing, not a regression.** Before C1, dao could not typecheck at all, so they were invisible. `core-server` is unaffected — it declares the dependency itself and typechecks clean.

**The fix** — add to `packages/@repo/dao/package.json` devDependencies, matching how `@repo/lib` declares it, then install:

```json
"@types/express-fileupload": "catalog:"
```

The catalog already pins `^1.5.1` in `pnpm-workspace.yaml`. Not applied here because it requires `pnpm install`, which rewrites the lockfile and `node_modules`.

---

## Not addressed — other pre-existing issues in `@repo/lib`

Found while verifying, unrelated to the schema and left alone:

- `otp-module/index.ts:4` — `RedisStore` is not exported from `@repo/redis`.
- `session-module/redis.session.ts:18,22` — `userID` is not a member of `AuthTokenPayload`.
- `session-module/redis.session.ts:39` — `checkRefreshToken` is incompatible with `IUserSession`.
- `@repo/mail/src/index.ts:2` — a `.tsx` module is imported with `--jsx` unset.

These sit in the auth, redis and mail modules. They do not affect `core-server`, which compiles clean.

### `db:seq` is a no-op stub

`create-sequence.utils.ts` executes an empty SQL template and prints `Sequences ensured ✅`. The real seeding is commented out. **Harmless** — `getNextId()` self-heals by inserting the sequence row from `ID_PREFIX_MAP` on first use, and `getTableConfig` / `addTableConfig` have no live callers. But the success message is misleading, and the commented block uses `prefix: "DC"` for `database_connection` where the comment above it uses `DB`.

### Tables with no operations

- `traditional_checks_library` — defined, and registered in `ID_PREFIX_MAP` as `"TC"`, but nothing reads or writes it. No repo, no route, no insert, no select.
- `traditional_config_details` — written at `qc.file-storage.repo.ts:164` and never read back; the pipeline reads it at job time. File-based configs only; DB-based configs never write field rules.
- `results` — the monorepo only ever reads it. The pipeline writes it.

---

## Applying this

1. Build the database from the schema: `pnpm --filter @repo/db db:push`.
2. Create the first admin: `pnpm --filter @repo/db db:init`.
3. Paste `v5_dbdiagram_erd_amended.dbml` into dbdiagram.io.

`monorepo_qc_tags_rename.sql` in this folder is only needed to migrate a database that already
holds the old `tag_type` / `tag_title` columns. **For a fresh database it is not needed** — the
schema files already carry the correct names.

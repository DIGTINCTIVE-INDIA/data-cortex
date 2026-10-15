# Connector & Custom Check Layer

Covers `Data_Code/` -- database connectivity, file storage access, and custom
SQL check management.

## Structure

```
Data_Code/
├── common/             # Shared utilities
│   ├── database.py     # Database session & engine management, init_db()
│   ├── encryption.py   # Secure password/secret handling
│   └── logger.py       # Centralized logging
├── connectors/         # Connection management
│   ├── db/             # Database connectors (PostgreSQL, MySQL, Snowflake, RDS)
│   └── file/           # File connectors (S3, Azure Blob, Local, SFTP)
├── custom_checks/      # Custom SQL check logic
│   ├── functions.py    # CRUD operations for custom checks
│   └── models.py       # DB models for checks
├── db_based_checks/    # CRUD for db_based_checks_config
└── file_based_checks/  # CRUD for file_based_checks_config
```

## Setup

1. Install dependencies: `pip install -r requirements.txt`
2. Configure `.env` in the project root with your real credentials (RDS/Postgres,
   S3, Snowflake -- see the root `.env` for the full variable list).

## Functionalities

- **Database connectors**: connection templates for PostgreSQL, MySQL, Snowflake.
  Passwords/secrets encrypted at rest via `common/encryption.py`.
- **File connectors**: S3, Azure Blob, SFTP, or Local Filesystem.
- **Custom checks**: SQL queries validating data quality, run against configured
  connections, invalid rows stored in the metadata database for review.

## Connection layer implementation guide

### Database connections (`database_connection`)

One row shape + one normalized runtime config dict for **PostgreSQL, MySQL, Snowflake, RDS**, via `build_connector_config()` in `Data_Code/connectors/db/manager.py`.

**Snowflake host/port (Option B):** Snowflake has no TCP host:port. `host`/`port` are `nullable=True` in the ORM; pass `host=None, port=None` on save. Real Snowflake params (`account`, `warehouse`, `role`) live in `additional_params`.

**`build_connector_config()`** overlays column-backed fields onto `additional_params`, and aliases `database`/`database_name` and `schema`/`db_schema` so every connector can use either naming style.

**Validation (`_validate_save_connection_fields`)**: `postgresql`/`mysql`/`rds` require non-empty `host` + `port > 0`; `snowflake` requires `additional_params.account`. All types require `database_type`, `username`, `password`, `database_name`, `db_schema`.

**Connectors** (`Data_Code/connectors/db/connectors.py`): Postgres/MySQL/Snowflake all accept either `database`/`database_name` and `schema`/`db_schema`; Postgres/Snowflake default schema to `public` if unset; RDS dispatches to Postgres or MySQL via `engine` in config. Note: `database_type` should always be the concrete engine (`postgresql`/`mysql`/`snowflake`) -- "rds" is a hosting service, not an engine, and is normalized away at the point of use (`normalize_database_type` in `trad_ct_id/connection_metadata.py`).

**File-ingest RDS helper** (`_get_or_create_db_connection` in `Data_Code/connectors/file/manager.py`): creates a connection using real host/port/username/password/database_name from `.env` RDS_* values -- currently ignores the calling config's own `target_connection_id` (tracked as an open decision, see `test_cases/decisions_needed.csv` item 9).

### File connections (`file_connection`)

`storage_type` (`s3`, `azure_blob`, `local`, `sftp`) is the **only** discriminator. `additional_params` holds fields with no dedicated column (Azure `account_name`/`tenant_id`/`account_url`, S3 `endpoint_url`, SFTP `host`/`port`).

- `save_file_connection(connection_name, storage_type, credentials)`
- `update_file_connection(connection_id, updates)` -- in-place update by ID
- `_map_credentials_to_db_fields` / `_map_db_to_config` map per-connector credentials to/from columns + `additional_params`.

### `init_db()` order (`Data_Code/common/database.py`)

1. Build engine from `.env` (`RDS_*` or `DATABASE_URL`)
2. Create schema if missing (Postgres)
3. Import ORM modules so `Base.metadata` has all tables
4. `Base.metadata.create_all(engine)` for missing tables
5. Seed the traditional-checks reference library (TC001-TC011) and label lookup libraries
6. Incremental migrations for `database_connection`, `file_connection`, `custom_business_checks_config`, `db_based_checks_config`, `file_based_checks_config`

Migrations are idempotent (check current columns before DDL).

### Quick reference

```python
# PostgreSQL
manager.save_connection(
    connection_name="app_pg", database_type="postgresql",
    host="db.example.com", port=5432, username="app", password="***",
    database_name="appdb", db_schema="public",
)

# Snowflake (no host/port; account/warehouse/role -> additional_params)
manager.save_connection(
    connection_name="app_sf", database_type="snowflake",
    host=None, port=None, username="svc_user", password="***",
    database_name="MY_DB", db_schema="MY_SCHEMA",
    account="xy12345.us-east-1", warehouse="COMPUTE_WH", role="ANALYST",
)

# File (S3)
file_mgr.save_file_connection(
    connection_name="my_bucket", storage_type="s3",
    credentials={"bucket": "my-bucket", "region": "us-east-1", "access_key_id": "...", "secret_key": "..."},
)
```

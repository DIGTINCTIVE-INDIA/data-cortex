-- ============================================================================
-- Fix Plan -- Batch 1: schema migrations
--
-- DESTRUCTIVE. Run Batch 0 first and resolve everything it reports.
-- Order matters; later steps depend on earlier ones.
--
-- Wrapped in a single transaction: if any statement fails, nothing applies.
-- PostgreSQL rolls back DDL cleanly, so a failure leaves the database exactly
-- as it was. Do not remove the BEGIN/COMMIT to "get past" a failing step --
-- investigate it instead.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Delete phantom rows.
--    Per D1, the product database in its staging role is now identified by an
--    in-memory sentinel ('_internal'), so these rows are never created again
--    and nothing reads the existing ones. They each hold an encrypted copy of
--    the product DB password.
--    Batch 0 check 3 lists exactly what this removes -- confirm that count.
-- ----------------------------------------------------------------------------
DELETE FROM database_connection WHERE connection_name LIKE 'Ingest_Dest_%';

-- ----------------------------------------------------------------------------
-- 2. Connection name uniqueness (B2). Requires Batch 0 check 1 to be empty.
-- ----------------------------------------------------------------------------
ALTER TABLE database_connection
  ADD CONSTRAINT database_connection_name_unique UNIQUE (connection_name);

-- ----------------------------------------------------------------------------
-- 3. users FK on database_connection.user_id (B4).
--    The column is varchar and users.id is uuid, so the type has to change
--    before the FK can exist. Placeholders are NULLed first; anything left
--    that isn't castable makes the ALTER refuse and name the value, at which
--    point the whole transaction rolls back -- fix that row and re-run.
--    Nullable is a consent-recorded deviation from the senior schema.
-- ----------------------------------------------------------------------------
ALTER TABLE database_connection ALTER COLUMN user_id DROP NOT NULL;

UPDATE database_connection SET user_id = NULL WHERE user_id IN ('system', 'SYSTEM');

-- Orphans: syntactically valid UUIDs that match no users row, so the FK would
-- reject them. On data_cortex_sit_prod_2 as of 2026-09-28 this is exactly two
-- rows -- DB002 and DB003, both enabled=false, both pointing at a
-- test-runner user (4ef2c258-...) that no longer exists. Re-run Batch 0
-- check 2 against the target database first and confirm what this covers
-- there; if any row is one you want reattributed rather than detached, set it
-- to the right user before running this.
UPDATE database_connection SET user_id = NULL
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id::text FROM users);

ALTER TABLE database_connection
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid;

ALTER TABLE database_connection
  ADD CONSTRAINT database_connection_user_fk
  FOREIGN KEY (user_id) REFERENCES users(id) DEFERRABLE INITIALLY DEFERRED;

-- ----------------------------------------------------------------------------
-- 4. Sequences for ID generation (B3).
--    setval positions each sequence past the highest number already in use, so
--    the first allocation can't collide with an existing row. Soft-deleted rows
--    are included on purpose: they still occupy their primary key.
--    The application creates these on first use if they're absent, so this step
--    is about making a migrated database and a fresh one identical.
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS database_connection_id_seq;
SELECT setval('database_connection_id_seq',
              GREATEST((SELECT COALESCE(MAX(SUBSTR(connection_id, 3)::int), 0)
                        FROM database_connection
                        WHERE connection_id ~ '^DB[0-9]+$'), 1));

CREATE SEQUENCE IF NOT EXISTS file_connection_id_seq;
SELECT setval('file_connection_id_seq',
              GREATEST((SELECT COALESCE(MAX(SUBSTR(connection_id, 3)::int), 0)
                        FROM file_connection
                        WHERE connection_id ~ '^FC[0-9]+$'), 1));

CREATE SEQUENCE IF NOT EXISTS db_based_checks_config_id_seq;
SELECT setval('db_based_checks_config_id_seq',
              GREATEST((SELECT COALESCE(MAX(SUBSTR(config_id, 4)::int), 0)
                        FROM db_based_checks_config
                        WHERE config_id ~ '^DBC[0-9]+$'), 1));

CREATE SEQUENCE IF NOT EXISTS file_based_checks_config_id_seq;
SELECT setval('file_based_checks_config_id_seq',
              GREATEST((SELECT COALESCE(MAX(SUBSTR(config_id, 4)::int), 0)
                        FROM file_based_checks_config
                        WHERE config_id ~ '^FBC[0-9]+$'), 1));

CREATE SEQUENCE IF NOT EXISTS custom_business_checks_config_id_seq;
SELECT setval('custom_business_checks_config_id_seq',
              GREATEST((SELECT COALESCE(MAX(SUBSTR(check_id, 3)::int), 0)
                        FROM custom_business_checks_config
                        WHERE check_id ~ '^CB[0-9]+$'), 1));

-- ----------------------------------------------------------------------------
-- 5-6. traditional_config_details uniqueness (D4 hygiene).
--      Prevents silently duplicated rules. Requires Batch 0 checks 4 and 5
--      to be empty. Consent-recorded addition beyond the senior schema.
-- ----------------------------------------------------------------------------
ALTER TABLE traditional_config_details
  ADD CONSTRAINT traditional_config_details_unique_field UNIQUE (config_id, field);

ALTER TABLE traditional_config_details
  ADD CONSTRAINT traditional_config_details_unique_order UNIQUE (config_id, column_order);

-- ----------------------------------------------------------------------------
-- 7. impacted_downstream becomes an optional FK id (G1).
--    The column currently holds free text; the other three label dimensions
--    are already normalized FK ids. Existing text values are resolved into
--    impacted_downstream_library rows and replaced with their ids.
-- ----------------------------------------------------------------------------
ALTER TABLE db_based_checks_config ALTER COLUMN impacted_downstream DROP NOT NULL;
ALTER TABLE file_based_checks_config ALTER COLUMN impacted_downstream DROP NOT NULL;
ALTER TABLE custom_business_checks_config ALTER COLUMN impacted_downstream DROP NOT NULL;

-- Seed any label that only exists as free text today.
INSERT INTO impacted_downstream_library (impacted_downstream_name)
SELECT DISTINCT trim(impacted_downstream)
FROM (
    SELECT impacted_downstream FROM db_based_checks_config
    UNION SELECT impacted_downstream FROM file_based_checks_config
    UNION SELECT impacted_downstream FROM custom_business_checks_config
) AS labels
WHERE impacted_downstream IS NOT NULL
  AND trim(impacted_downstream) <> ''
  AND trim(impacted_downstream) NOT IN (
      SELECT impacted_downstream_name FROM impacted_downstream_library
  );

-- Replace the text with the library id, then change the column type.
ALTER TABLE db_based_checks_config
  ALTER COLUMN impacted_downstream TYPE integer
  USING (SELECT l.impacted_downstream_id
         FROM impacted_downstream_library l
         WHERE l.impacted_downstream_name = trim(db_based_checks_config.impacted_downstream));
ALTER TABLE db_based_checks_config
  ADD CONSTRAINT db_based_checks_config_impacted_fk
  FOREIGN KEY (impacted_downstream) REFERENCES impacted_downstream_library(impacted_downstream_id);

ALTER TABLE file_based_checks_config
  ALTER COLUMN impacted_downstream TYPE integer
  USING (SELECT l.impacted_downstream_id
         FROM impacted_downstream_library l
         WHERE l.impacted_downstream_name = trim(file_based_checks_config.impacted_downstream));
ALTER TABLE file_based_checks_config
  ADD CONSTRAINT file_based_checks_config_impacted_fk
  FOREIGN KEY (impacted_downstream) REFERENCES impacted_downstream_library(impacted_downstream_id);

ALTER TABLE custom_business_checks_config
  ALTER COLUMN impacted_downstream TYPE integer
  USING (SELECT l.impacted_downstream_id
         FROM impacted_downstream_library l
         WHERE l.impacted_downstream_name = trim(custom_business_checks_config.impacted_downstream));
ALTER TABLE custom_business_checks_config
  ADD CONSTRAINT custom_business_checks_config_impacted_fk
  FOREIGN KEY (impacted_downstream) REFERENCES impacted_downstream_library(impacted_downstream_id);

-- ----------------------------------------------------------------------------
-- 8. results.field becomes nullable (E1).
--    Custom-check rows now write NULL instead of the literal string
--    '___placeholder__'. Consent-recorded deviation from the senior schema.
-- ----------------------------------------------------------------------------
ALTER TABLE public.results ALTER COLUMN field DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- 9. source_table_name on custom checks (E7).
--    Populated at save time by validate_custom_check_sql. Left NULL for
--    existing rows; the execution path still derives it from the SQL when the
--    column is empty, so existing checks keep working until they're next saved.
-- ----------------------------------------------------------------------------
ALTER TABLE custom_business_checks_config ADD COLUMN source_table_name VARCHAR(255);

-- ----------------------------------------------------------------------------
-- 10. database_type canonicalization (D6). One spelling stored: 'postgres'.
-- ----------------------------------------------------------------------------
UPDATE database_connection SET database_type = 'postgres' WHERE database_type = 'postgresql';

-- ----------------------------------------------------------------------------
-- 11. Drop schema_file_name (D4). Misleading dead metadata: nothing ever read
--     the file it named, and column_order/column_datatype come from
--     traditional_config_details.
-- ----------------------------------------------------------------------------
ALTER TABLE file_based_checks_config DROP COLUMN IF EXISTS schema_file_name;

-- ----------------------------------------------------------------------------
-- 12. landing_table column default.
--
--     No data backfill is needed. Batch 0 check 10 on data_cortex_sit_prod_2
--     (2026-09-28) shows every existing config already has landing_table =
--     TRUE: 11 db-based, 5 file-based, none FALSE. So wiring F4 changes
--     nothing for existing configs, exactly as the plan intended.
--
--     The column DEFAULT, however, is FALSE, which is the opposite of the
--     plan's "default stays True". Left as-is would mean every *new* config
--     silently skips its landing table. Aligning the default with the
--     intended behaviour:
-- ----------------------------------------------------------------------------
ALTER TABLE db_based_checks_config   ALTER COLUMN landing_table SET DEFAULT TRUE;
ALTER TABLE file_based_checks_config ALTER COLUMN landing_table SET DEFAULT TRUE;

COMMIT;

-- ============================================================================
-- Fix Plan -- Batch 0: pre-deploy checks
--
-- READ ONLY. Every statement is a SELECT; nothing here modifies data.
-- Run against the live product database before anything else.
--
-- Each query either returns no rows (pass) or returns the rows that have to
-- be resolved by hand before the Batch 1 migration will apply cleanly.
-- ============================================================================

\echo '--- 1. Duplicate connection names (must be empty before the UNIQUE constraint) ---'
SELECT connection_name, count(*) AS occurrences
FROM database_connection
GROUP BY connection_name
HAVING count(*) > 1;

\echo '--- 2. Orphan user_ids (rows here become NULL in migration step 2) ---'
SELECT connection_id, user_id
FROM database_connection
WHERE user_id IS NOT NULL
  AND user_id NOT IN ('system', 'SYSTEM')
  AND user_id NOT IN (SELECT id::text FROM users);

\echo '--- 3. Phantom Ingest_Dest_* rows (deleted wholesale in migration step 1; note the count) ---'
SELECT connection_id, connection_name, created_at
FROM database_connection
WHERE connection_name LIKE 'Ingest_Dest_%'
ORDER BY created_at;

\echo '--- 4. Duplicate field entries per config (must be empty before UNIQUE(config_id, field)) ---'
SELECT config_id, field, count(*) AS occurrences
FROM traditional_config_details
GROUP BY config_id, field
HAVING count(*) > 1;

\echo '--- 5. Duplicate column_order per config (must be empty before UNIQUE(config_id, column_order)) ---'
SELECT config_id, column_order, count(*) AS occurrences
FROM traditional_config_details
GROUP BY config_id, column_order
HAVING count(*) > 1;

\echo '--- 6a. DB-based configs with zero field rows (these fail loud at job time post-D8) ---'
SELECT config_id, config_name
FROM db_based_checks_config
WHERE config_id NOT IN (SELECT DISTINCT config_id FROM traditional_config_details);

\echo '--- 6b. File-based configs with zero field rows ---'
SELECT config_id, config_name
FROM file_based_checks_config
WHERE config_id NOT IN (SELECT DISTINCT config_id FROM traditional_config_details);

\echo '--- 7. Existing database_type=postgresql rows (canonicalized to postgres in migration step 10) ---'
SELECT connection_id, database_type
FROM database_connection
WHERE database_type = 'postgresql';

\echo '--- 8. CB configs whose SQL the new save-time validator would reject ---'
-- Same constructs validate_custom_check_sql rejects. This is a coarse text
-- scan (it does not strip string literals, unlike the Python validator), so
-- treat hits as "review these", not as a definitive reject list. Run
-- scripts/audit_custom_check_sql.py for the authoritative answer.
SELECT check_id, check_name,
       CASE
         WHEN sql_query ~* '\mjoin\M'      THEN 'JOIN'
         WHEN sql_query ~* '\mwith\M'      THEN 'CTE'
         WHEN sql_query ~* '\munion\M'     THEN 'UNION'
         WHEN sql_query ~* '\mintersect\M' THEN 'INTERSECT'
         WHEN sql_query ~* '\mexcept\M'    THEN 'EXCEPT'
         WHEN sql_query ~* 'group\s+by'    THEN 'GROUP BY'
         WHEN sql_query ~* '\mhaving\M'    THEN 'HAVING'
         WHEN sql_query ~* 'over\s*\('     THEN 'window function'
         ELSE 'aggregate'
       END AS unsupported_construct
FROM custom_business_checks_config
WHERE sql_query ~* '\mjoin\M|\mwith\M|\munion\M|\mintersect\M|\mexcept\M|group\s+by|\mhaving\M|over\s*\(|\m(count|sum|avg|min|max|array_agg|string_agg)\s*\(';

\echo '--- 9. Non-castable user_id values (the uuid ALTER in step 3 will name these itself if any remain) ---'
SELECT connection_id, user_id
FROM database_connection
WHERE user_id IS NOT NULL
  AND user_id NOT IN ('system', 'SYSTEM')
  AND user_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

\echo '--- 10. Landing-table setting across existing configs (see the note in batch1, step 12) ---'
SELECT 'db_based' AS family, landing_table, count(*) AS configs
FROM db_based_checks_config GROUP BY landing_table
UNION ALL
SELECT 'file_based', landing_table, count(*)
FROM file_based_checks_config GROUP BY landing_table;

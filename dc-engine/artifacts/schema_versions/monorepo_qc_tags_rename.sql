-- ============================================================================
--  qc_tags column rename -- aligns the monorepo database with the approved ERD
--
--  Prepared 2026-10-06. Run by: Rajan / Asad. NOT run by Claude.
--
--  WHAT THIS DOES
--    Renames two columns so the database matches both the ERD and the updated
--    Drizzle schema:
--        qc_tags.tag_type  -> qc_tags.type
--        qc_tags.tag_title -> qc_tags.title
--
--  WHY IT MUST RUN BEFORE THE CODE DEPLOYS
--    The monorepo schema (libraries.schema.ts) has already been updated to the
--    new names. Until this runs, every qc_tags query in the running server
--    fails. Run this FIRST, then deploy. There is no safe gap between them.
--
--  WHY NOT JUST RUN `pnpm db:push`
--    There are no migration files in this repo -- push diffs the schema against
--    the live database. It sees one column gone and another appeared, and
--    PROMPTS whether that is a rename or a drop-and-create. Answering wrong, or
--    running it non-interactively, executes:
--        ALTER TABLE qc_tags DROP COLUMN tag_type;
--        ALTER TABLE qc_tags ADD COLUMN type qc_tag_type NOT NULL;
--    which destroys every tag's type and title. qc_tags drives check_category,
--    workstream, data_source and impacted_downstream across every config and
--    every result row.
--
--    Running this script first means push sees no difference at all, so the
--    prompt never appears.
--
--  AFTER RUNNING
--    `pnpm --filter @repo/db db:push` should report no changes to qc_tags.
--    It WILL still report other differences -- see the schema-drift section of
--    ERD_AMENDMENTS.md. Those are pre-existing and are NOT addressed here.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Guard: fail loudly if this has already been applied, rather than half-apply.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'qc_tags' AND column_name = 'tag_type'
    ) THEN
        RAISE EXCEPTION 'qc_tags.tag_type not found -- already renamed, or wrong database';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'qc_tags' AND column_name = 'tag_title'
    ) THEN
        RAISE EXCEPTION 'qc_tags.tag_title not found -- already renamed, or wrong database';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'qc_tags' AND column_name IN ('type', 'title')
    ) THEN
        RAISE EXCEPTION 'qc_tags already has a type or title column -- resolve by hand';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- The rename. RENAME COLUMN preserves data, type, constraints and indexes.
-- No rows are read or written.
-- ---------------------------------------------------------------------------
ALTER TABLE qc_tags RENAME COLUMN tag_type  TO type;
ALTER TABLE qc_tags RENAME COLUMN tag_title TO title;

COMMIT;

-- ============================================================================
--  VERIFY -- run after committing. Expect exactly two rows: type, title.
-- ============================================================================
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'qc_tags'
--    AND column_name IN ('type', 'title', 'tag_type', 'tag_title')
--  ORDER BY column_name;

-- ============================================================================
--  ROLLBACK -- if the deploy is reverted, put the old names back.
-- ============================================================================
-- BEGIN;
-- ALTER TABLE qc_tags RENAME COLUMN type  TO tag_type;
-- ALTER TABLE qc_tags RENAME COLUMN title TO tag_title;
-- COMMIT;

-- ============================================================================
--  NOT RENAMED, ON PURPOSE
--    The PostgreSQL enum TYPE is called qc_tag_type. That is the type's name,
--    not a column name, and the ERD does not specify it. It stays as-is.
--    In the schema it appears as:  pgEnum("qc_tag_type", [...])
-- ============================================================================

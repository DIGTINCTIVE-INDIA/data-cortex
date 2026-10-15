/**
 * Improved Results Seed Script
 *
 * What this does:
 * - Clears all existing results.
 * - Inserts 1,000,000 randomized records by default.
 * - Uses real qc_tags library IDs.
 * - Creates data from 2026-06-01 back to ~3 years.
 * - Keeps a large latest batch for "current_batch" dashboard/report filters.
 * - Randomizes timestamps, seconds, sources, workstreams, categories, criticality, issue status.
 * - Creates realistic weighted patterns instead of predictable modulo-only records.
 *
 * Run:
 * pnpm tsx path/to/seed-results.ts
 *
 * Optional:
 * RESULT_RECORD_COUNT=1000000 RESULT_BATCH_SIZE=50000 pnpm tsx path/to/seed-results.ts
 */
import { db } from "@repo/db";
import { sql } from "drizzle-orm";
const USER_ID = "531b3e12-52bc-4ad9-a4f0-9662a0b26720";

const DEFAULT_TOTAL_RECORDS = 1_000_000;
const DEFAULT_BATCH_SIZE = 50_000;

const totalRecords = Number(process.env.RESULT_RECORD_COUNT ?? DEFAULT_TOTAL_RECORDS);
const batchSize = Number(process.env.RESULT_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);

const shouldTruncate = true;

/**
 * Fixed "today" for mock analytics.
 * This makes current_week/current_month/current_year filters stable.
 */
const anchorTimestamp = "2026-06-01 23:59:59+00";

const assertSafeNumber = (value: number, label: string) => {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must be a positive number`);
	}
};

const seedResults = async () => {
	assertSafeNumber(totalRecords, "RESULT_RECORD_COUNT");
	assertSafeNumber(batchSize, "RESULT_BATCH_SIZE");

	console.log("Starting improved results seed...");
	console.log(`Total records: ${totalRecords.toLocaleString()}`);
	console.log(`Batch size: ${batchSize.toLocaleString()}`);
	console.log(`Anchor timestamp: ${anchorTimestamp}`);
	console.log(`Truncate first: ${shouldTruncate ? "yes" : "no"}`);

	if (shouldTruncate) {
		console.log("Truncating results table...");

		await db.execute(sql`
			TRUNCATE TABLE results RESTART IDENTITY;
		`);
	}

	const startedAt = Date.now();

	for (let start = 1; start <= totalRecords; start += batchSize) {
		const end = Math.min(start + batchSize - 1, totalRecords);

		console.log(`Inserting rows ${start.toLocaleString()} - ${end.toLocaleString()}...`);

		await db.execute(sql`
			INSERT INTO results (
				job_id,
				job_timestamp,
				user_id,
				check_id,
				check_name,
				check_description,
				config_id,
				config_name,
				check_category,
				workstream,
				impacted_downstream,
				data_source,
				file_or_table_name,
				check_type,
				field,
				abort,
				check_status,
				criticality,
				issue_rows,
				passed_rows,
				failure_reason,
				issue_status
			)

			WITH base AS (
				SELECT
					gs::integer AS gs,

					random() AS r_period,
					random() AS r_day,
					random() AS r_business_hour,
					random() AS r_second,

					random() AS r_workstream,
					random() AS r_source,
					random() AS r_category,
					random() AS r_downstream,
					random() AS r_check,

					random() AS r_failure,
					random() AS r_criticality,
					random() AS r_issue_status,
					random() AS r_abort,
					random() AS r_volume,
					random() AS r_issue_size,
					random() AS r_noise,
					random() AS r_job_bucket

				FROM generate_series(${start}::integer, ${end}::integer) AS gs
			),

			clocked AS (
				SELECT
					base.*,

					CASE
						WHEN r_business_hour < 0.72 THEN
							(
								(8 * 3600)
								+ FLOOR(r_second * (11 * 3600))::integer
							)

						ELSE FLOOR(r_second * 86400)::integer
					END AS seconds_in_day

				FROM base
			),

			timed AS (
				SELECT
					clocked.*,

					(
						CASE
							/*
							 * 3.5% latest batch.
							 * This is intentionally exact so current_batch has enough rows.
							 */
							WHEN r_period < 0.035 THEN
								${anchorTimestamp}::timestamptz

							/*
							 * Current day, excluding latest-batch rows.
							 */
							WHEN r_period < 0.18 THEN
								date_trunc('day', ${anchorTimestamp}::timestamptz)
								+ (seconds_in_day * interval '1 second')

							/*
							 * Last 7 days.
							 */
							WHEN r_period < 0.35 THEN
								date_trunc('day', ${anchorTimestamp}::timestamptz)
								- ((1 + FLOOR(r_day * 6))::integer * interval '1 day')
								+ (seconds_in_day * interval '1 second')

							/*
							 * Last 30 days.
							 */
							WHEN r_period < 0.55 THEN
								date_trunc('day', ${anchorTimestamp}::timestamptz)
								- ((7 + FLOOR(r_day * 24))::integer * interval '1 day')
								+ (seconds_in_day * interval '1 second')

							/*
							 * Last 6 months / quarter-to-date / year-to-date coverage.
							 */
							WHEN r_period < 0.75 THEN
								date_trunc('day', ${anchorTimestamp}::timestamptz)
								- ((31 + FLOOR(r_day * 150))::integer * interval '1 day')
								+ (seconds_in_day * interval '1 second')

							/*
							 * Older 2025-ish data.
							 */
							WHEN r_period < 0.90 THEN
								date_trunc('day', ${anchorTimestamp}::timestamptz)
								- ((181 + FLOOR(r_day * 550))::integer * interval '1 day')
								+ (seconds_in_day * interval '1 second')

							/*
							 * 2-3 years back.
							 */
							ELSE
								date_trunc('day', ${anchorTimestamp}::timestamptz)
								- ((731 + FLOOR(r_day * 364))::integer * interval '1 day')
								+ (seconds_in_day * interval '1 second')
						END
					) AT TIME ZONE 'UTC' AS job_timestamp

				FROM clocked
			),

			dimensions AS (
			SELECT
				timed.*,

				CASE
					WHEN r_workstream < 0.5 THEN 3
					ELSE 6
				END AS workstream_id,

				5 AS data_source_id,

				CASE
					WHEN r_category < 0.5 THEN 1
					ELSE 2
				END AS category_id,

				FLOOR(r_check * 12)::integer AS check_ix

			FROM timed
			),

			risked AS (
				SELECT
					dimensions.*,

					GREATEST(
						0,
						FLOOR(
							EXTRACT(
								EPOCH FROM (${anchorTimestamp}::timestamp - dimensions.job_timestamp)
							) / 86400
						)::integer
					) AS age_days,

					LEAST(
						0.62,
						GREATEST(
							0.035,

							/*
							 * Base risk + business weighted risk.
							 * This gives visible but realistic chart variation.
							 */
							0.075

							+ CASE dimensions.category_id
								WHEN 1 THEN 0.075
								WHEN 2 THEN 0.115
								ELSE 0.040
							END

							+ CASE dimensions.data_source_id
								WHEN 5 THEN 0.055
								ELSE 0.030
							END

							+ CASE dimensions.workstream_id
								WHEN 6 THEN 0.055
								WHEN 3 THEN 0.040
								ELSE 0.030
							END

							+ CASE
								WHEN dimensions.job_timestamp >= timestamp '2026-06-01 00:00:00' THEN 0.055
								WHEN dimensions.job_timestamp >= timestamp '2026-05-25 00:00:00' THEN 0.035
								WHEN dimensions.job_timestamp >= timestamp '2026-04-01 00:00:00' THEN 0.020
								ELSE 0.000
							END

							+ CASE
								WHEN EXTRACT(ISODOW FROM dimensions.job_timestamp) IN (1, 5) THEN 0.025
								WHEN EXTRACT(ISODOW FROM dimensions.job_timestamp) IN (6, 7) THEN -0.010
								ELSE 0.005
							END

							+ ((dimensions.r_noise - 0.5) * 0.07)
						)
					) AS failure_probability,

					(600 + FLOOR(dimensions.r_volume * 240000))::integer AS total_checked_rows

				FROM dimensions
			),

			evaluated AS (
				SELECT
					risked.*,

					(risked.r_failure < risked.failure_probability) AS is_failed,

					CASE
						WHEN risked.r_failure < risked.failure_probability THEN
							CASE
								WHEN risked.r_criticality < LEAST(0.72, 0.30 + risked.failure_probability) THEN 'high'
								WHEN risked.r_criticality < 0.84 THEN 'medium'
								ELSE 'low'
							END

						ELSE
							CASE
								WHEN risked.r_criticality < 0.06 THEN 'high'
								WHEN risked.r_criticality < 0.28 THEN 'medium'
								ELSE 'low'
							END
					END AS criticality_text

				FROM risked
			),

			row_counts AS (
				SELECT
					evaluated.*,

					CASE
						WHEN NOT evaluated.is_failed THEN 0

						WHEN evaluated.criticality_text = 'high' THEN
							GREATEST(
								1,
								FLOOR(
									evaluated.total_checked_rows
									* (0.025 + evaluated.r_issue_size * 0.185)
								)::integer
							)

						WHEN evaluated.criticality_text = 'medium' THEN
							GREATEST(
								1,
								FLOOR(
									evaluated.total_checked_rows
									* (0.010 + evaluated.r_issue_size * 0.075)
								)::integer
							)

						ELSE
							GREATEST(
								1,
								FLOOR(
									evaluated.total_checked_rows
									* (0.002 + evaluated.r_issue_size * 0.025)
								)::integer
							)
					END AS issue_count

				FROM evaluated
			)

			SELECT
				'JOB_'
				|| TO_CHAR(job_timestamp, 'YYYYMMDD_HH24MI')
				|| '_'
				|| LPAD((1 + FLOOR(r_job_bucket * 24))::text, 2, '0') AS job_id,

				job_timestamp,
				${USER_ID}::uuid AS user_id,

				CASE check_ix
					WHEN 0 THEN 'TC001'
					WHEN 1 THEN 'TC002'
					WHEN 2 THEN 'TC003'
					WHEN 3 THEN 'TC004'
					WHEN 4 THEN 'TC005'
					WHEN 5 THEN 'TC006'
					WHEN 6 THEN 'TC007'
					WHEN 7 THEN 'TC008'
					WHEN 8 THEN 'TC009'
					WHEN 9 THEN 'TC010'
					WHEN 10 THEN 'CSQL001'
					ELSE 'CSQL002'
				END AS check_id,

				CASE check_ix
					WHEN 0 THEN 'Primary Key'
					WHEN 1 THEN 'Null'
					WHEN 2 THEN 'Duplicate'
					WHEN 3 THEN 'Referential Integrity'
					WHEN 4 THEN 'List of Values'
					WHEN 5 THEN 'Length'
					WHEN 6 THEN 'Format'
					WHEN 7 THEN 'Range'
					WHEN 8 THEN 'Freshness'
					WHEN 9 THEN 'Cross Reference'
					WHEN 10 THEN 'Customer Validation SQL'
					ELSE 'Revenue Reconciliation SQL'
				END AS check_name,

				CASE check_ix
					WHEN 0 THEN 'Validates primary key population and uniqueness'
					WHEN 1 THEN 'Checks for null values in required fields'
					WHEN 2 THEN 'Detects duplicate business keys and duplicate rows'
					WHEN 3 THEN 'Validates referential integrity with related entities'
					WHEN 4 THEN 'Checks values against approved reference lists'
					WHEN 5 THEN 'Validates configured field length boundaries'
					WHEN 6 THEN 'Checks field format and standardization rules'
					WHEN 7 THEN 'Validates values against allowed numeric or date ranges'
					WHEN 8 THEN 'Checks whether records arrived within expected SLA'
					WHEN 9 THEN 'Cross references records with master datasets'
					WHEN 10 THEN 'Runs custom SQL for customer validation'
					ELSE 'Runs custom SQL for revenue reconciliation'
				END AS check_description,

				'QC_CFG_'
				|| workstream_id::text
				|| '_'
				|| data_source_id::text
				|| '_'
				|| LPAD(((gs % 2500) + 1)::text, 4, '0') AS config_id,

				CASE workstream_id
					WHEN 6 THEN 'MDM Quality Configuration'
					WHEN 5 THEN 'Field Operations Quality Configuration'
					WHEN 4 THEN 'Medical Affairs Quality Configuration'
					WHEN 3 THEN 'Marketing Quality Configuration'
					ELSE 'Sales Quality Configuration'
				END AS config_name,

				category_id AS check_category,

				workstream_id AS workstream,

				ARRAY[4]::integer[] AS impacted_downstream,

				data_source_id AS data_source,

				CASE data_source_id
					WHEN 11 THEN
						CASE workstream_id
							WHEN 6 THEN 'internal_mdm_customer_master'
							WHEN 5 THEN 'internal_field_activity_daily'
							WHEN 4 THEN 'internal_medical_events'
							WHEN 3 THEN 'internal_marketing_campaigns'
							ELSE 'internal_sales_performance'
						END

					WHEN 10 THEN
						CASE workstream_id
							WHEN 6 THEN 'sf_mdm_account_bridge'
							WHEN 5 THEN 'sf_field_call_activity'
							WHEN 4 THEN 'sf_medical_inquiries'
							WHEN 3 THEN 'sf_campaign_response'
							ELSE 'sf_opportunity_customer'
						END

					WHEN 9 THEN
						CASE workstream_id
							WHEN 6 THEN 'claritas_hcp_reference'
							WHEN 5 THEN 'claritas_territory_alignment'
							WHEN 4 THEN 'claritas_medical_segment'
							WHEN 3 THEN 'claritas_marketing_audience'
							ELSE 'claritas_sales_universe'
						END

					WHEN 8 THEN
						CASE workstream_id
							WHEN 6 THEN 'iqvia_customer_master'
							WHEN 5 THEN 'iqvia_activity_fact'
							WHEN 4 THEN 'iqvia_medical_affairs_fact'
							WHEN 3 THEN 'iqvia_marketing_fact'
							ELSE 'iqvia_sales_fact'
						END

					ELSE
						CASE workstream_id
							WHEN 6 THEN 'veeva_account_master'
							WHEN 5 THEN 'veeva_call_activity'
							WHEN 4 THEN 'veeva_medical_event'
							WHEN 3 THEN 'veeva_campaign_detail'
							ELSE 'veeva_sales_activity'
						END
				END AS file_or_table_name,

				CASE
					WHEN check_ix IN (10, 11) THEN 'custom_sql'::check_type
					ELSE 'conformance'::check_type
				END AS check_type,

				CASE check_ix
					WHEN 0 THEN 'primary_key'
					WHEN 1 THEN 'required_value'
					WHEN 2 THEN 'business_key'
					WHEN 3 THEN 'parent_record_id'
					WHEN 4 THEN 'status'
					WHEN 5 THEN 'field_length'
					WHEN 6 THEN 'zip'
					WHEN 7 THEN 'effective_date'
					WHEN 8 THEN 'last_modified_at'
					WHEN 9 THEN 'customer_id'
					WHEN 10 THEN 'custom_sql_result'
					ELSE 'reconciliation_amount'
				END AS field,

				(r_abort < 0.0025) AS abort,

				CASE
					WHEN is_failed THEN 'failed'::check_status
					ELSE 'passed'::check_status
				END AS check_status,

				criticality_text::results_criticality AS criticality,

				issue_count::text AS issue_rows,

				GREATEST(0, total_checked_rows - issue_count)::text AS passed_rows,

				CASE
					WHEN NOT is_failed THEN 'Check successfully passed'

					WHEN check_ix = 0 THEN 'Primary key validation failed'
					WHEN check_ix = 1 THEN 'Required values are missing'
					WHEN check_ix = 2 THEN 'Duplicate values were found'
					WHEN check_ix = 3 THEN 'Referential integrity validation failed'
					WHEN check_ix = 4 THEN 'Value is outside allowed list'
					WHEN check_ix = 5 THEN 'Expected length did not match configured boundary'
					WHEN check_ix = 6 THEN 'Format validation failed for configured field'
					WHEN check_ix = 7 THEN 'Value is outside configured range'
					WHEN check_ix = 8 THEN 'Records arrived outside expected freshness SLA'
					WHEN check_ix = 9 THEN 'Cross reference failed against master data'
					WHEN check_ix = 10 THEN 'Custom SQL validation returned failed rows'
					ELSE 'Custom SQL reconciliation mismatch found'
				END AS failure_reason,

				CASE
					WHEN NOT is_failed THEN NULL

					WHEN age_days <= 7 THEN
						CASE
							WHEN r_issue_status < 0.66 THEN 'open'::issue_status
							WHEN r_issue_status < 0.88 THEN 'resolved'::issue_status
							ELSE 'discarded'::issue_status
						END

					WHEN age_days <= 45 THEN
						CASE
							WHEN r_issue_status < 0.36 THEN 'open'::issue_status
							WHEN r_issue_status < 0.82 THEN 'resolved'::issue_status
							ELSE 'discarded'::issue_status
						END

					WHEN age_days <= 180 THEN
						CASE
							WHEN r_issue_status < 0.20 THEN 'open'::issue_status
							WHEN r_issue_status < 0.78 THEN 'resolved'::issue_status
							ELSE 'discarded'::issue_status
						END

					ELSE
						CASE
							WHEN r_issue_status < 0.10 THEN 'open'::issue_status
							WHEN r_issue_status < 0.76 THEN 'resolved'::issue_status
							ELSE 'discarded'::issue_status
						END
				END AS issue_status

			FROM row_counts;
		`);

		const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
		console.log(`Inserted up to ${end.toLocaleString()} rows. Elapsed: ${elapsedSeconds}s`);
	}

	console.log("Analyzing results table...");

	await db.execute(sql`
		ANALYZE results;
	`);

	const countResult = await db.execute<{
		totalRecords: number;
		failedRecords: number;
		passedRecords: number;
		openIssues: number;
		resolvedIssues: number;
		discardedIssues: number;
		minTimestamp: Date;
		maxTimestamp: Date;
	}>(sql`
		SELECT
			COUNT(*)::integer AS "totalRecords",
			COUNT(*) FILTER (WHERE check_status = 'failed')::integer AS "failedRecords",
			COUNT(*) FILTER (WHERE check_status = 'passed')::integer AS "passedRecords",
			COUNT(*) FILTER (WHERE COALESCE(issue_status, 'open') = 'open' AND check_status = 'failed')::integer AS "openIssues",
			COUNT(*) FILTER (WHERE issue_status = 'resolved')::integer AS "resolvedIssues",
			COUNT(*) FILTER (WHERE issue_status = 'discarded')::integer AS "discardedIssues",
			MIN(job_timestamp) AS "minTimestamp",
			MAX(job_timestamp) AS "maxTimestamp"
		FROM results;
	`);

	const sourceBreakdown = await db.execute(sql`
		SELECT
			data_source,
			COUNT(*)::integer AS total,
			COUNT(*) FILTER (WHERE check_status = 'failed')::integer AS failed
		FROM results
		GROUP BY data_source
		ORDER BY data_source;
	`);

	const workstreamBreakdown = await db.execute(sql`
		SELECT
			workstream,
			COUNT(*)::integer AS total,
			COUNT(*) FILTER (WHERE check_status = 'failed')::integer AS failed
		FROM results
		GROUP BY workstream
		ORDER BY workstream;
	`);

	console.log("Results seed completed.");
	console.log(countResult.rows[0]);

	console.log("Source breakdown:");
	console.table(sourceBreakdown.rows);

	console.log("Workstream breakdown:");
	console.table(workstreamBreakdown.rows);
};

seedResults()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		console.error("Failed to seed results:");
		console.error(error);
		process.exit(1);
	});

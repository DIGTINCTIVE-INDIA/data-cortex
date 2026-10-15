// src/scripts/seed-data.ts
//
// Starting reference data for a fresh database.
//
// qc_tags is a hard dependency: check_category, workstream and data_source are
// NOT NULL foreign keys into it on all three config tables, so no QC config of
// any kind can be created while this table is empty.
//
// These tags remain editable through the libraries API once seeded -- this is a
// starting taxonomy, not a fixed source of truth. Edit the list below to change
// what a fresh install begins with.

import type { qctagTypeEnum } from "../schema/libraries.schema.js";

type QcTagType = (typeof qctagTypeEnum.enumValues)[number];

export type QcTagSeed = {
	tagType: QcTagType;
	tagTitle: string;
	description: string;
};

/**
 * The fixed master list of traditional check types, seeded into
 * traditional_checks_library_rev.
 *
 * The ENGINE reads these: `checkMappingName` names the check function it runs,
 * and `abort` decides whether a failure stops the whole job or just records an
 * issue. Values are matched to the engine's own seed
 * (dc-engine Data_Code/common/database.py) and must stay identical -- a check
 * type the engine does not recognise simply never runs.
 *
 * Reference data, not user-editable: there is no API to change it.
 */
export type TraditionalCheckSeed = {
	checkId: string;
	checkMappingName: string;
	checkName: string;
	checkDescription: string;
	abort: boolean;
};

export const TRADITIONAL_CHECKS_SEED: TraditionalCheckSeed[] = [
	{
		checkId: "TC001",
		checkMappingName: "file_availability_check",
		checkName: "File Availability",
		checkDescription: "Ensures required file exists before processing",
		abort: true,
	},
	{
		checkId: "TC002",
		checkMappingName: "column_name_check",
		checkName: "Column Name",
		checkDescription: "Ensures all columns are named correctly according to the schema",
		abort: true,
	},
	{
		checkId: "TC003",
		checkMappingName: "column_order_check",
		checkName: "Column Order",
		checkDescription: "Ensures all columns are ordered correctly based on the schema",
		abort: true,
	},
	{
		checkId: "TC004",
		checkMappingName: "datatype_check",
		checkName: "Data Type",
		checkDescription: "Validates correct data type for fields",
		abort: true,
	},
	{
		checkId: "TC005",
		checkMappingName: "primary_key_check",
		checkName: "Primary Key",
		checkDescription: "Ensures primary key exists and populated correctly",
		abort: false,
	},
	{
		checkId: "TC006",
		checkMappingName: "ri_check",
		checkName: "Referential Integrity",
		checkDescription: "Validates the referential integrity from another file's column",
		abort: false,
	},
	{
		checkId: "TC007",
		checkMappingName: "null_check",
		checkName: "Null",
		checkDescription: "Detects missing or empty field values",
		abort: false,
	},
	{
		checkId: "TC008",
		checkMappingName: "duplicate_check",
		checkName: "Duplicate",
		checkDescription: "Identifies repeated or redundant data entries",
		abort: false,
	},
	{
		checkId: "TC009",
		checkMappingName: "lov_check",
		checkName: "List of Values",
		checkDescription: "Verifies data matches the expected List of Values",
		abort: false,
	},
	{
		checkId: "TC010",
		checkMappingName: "format_check",
		checkName: "Format",
		checkDescription: "Verifies data matches expected format pattern",
		abort: false,
	},
	{
		checkId: "TC011",
		checkMappingName: "length_check",
		checkName: "Length",
		checkDescription: "Confirms field length within defined limits",
		abort: false,
	},
];

export const QC_TAGS_SEED: QcTagSeed[] = [
	// -- workstreams -----------------------------------------------------------
	{
		tagType: "workstream",
		tagTitle: "Sales",
		description: "Sales workflow including files, checks and processing logic",
	},
	{
		tagType: "workstream",
		tagTitle: "CRM",
		description: "CRM workflow handling customer master and interaction data",
	},

	// -- categories ------------------------------------------------------------
	{
		tagType: "category",
		tagTitle: "IQVIA Cross Reference",
		description: "Category representing IQVIA cross-reference checks and mappings",
	},
	{
		tagType: "category",
		tagTitle: "Range/LOV",
		description: "Category for range checks and list-of-values validations",
	},
	{
		tagType: "category",
		tagTitle: "Account",
		description: "Category related to customer or account-level validations",
	},
	{
		tagType: "category",
		tagTitle: "Affiliation",
		description: "Category related to affiliation and relationship validations",
	},
	{
		tagType: "category",
		tagTitle: "Calls",
		description: "Category related to call activity and call-level validations",
	},

	// -- data sources ----------------------------------------------------------
	{
		tagType: "data_source",
		tagTitle: "ACCOUNT",
		description: "Customer or account-level data source used for validations",
	},
	{
		tagType: "data_source",
		tagTitle: "AFFILIATION_VOD_C",
		description: "Affiliation dataset sourced from Veeva VOD_C",
	},
	{
		tagType: "data_source",
		tagTitle: "Veeva/IQVIA",
		description: "Data provided jointly or interchangeably by Veeva and IQVIA systems",
	},
	{
		tagType: "data_source",
		tagTitle: "IQVIA LAAD",
		description: "IQVIA LAAD dataset used for healthcare provider and sales activities",
	},
	{
		tagType: "data_source",
		tagTitle: "All Vendors",
		description: "Combined data collected from all external vendor sources",
	},

	// -- impacted downstream ---------------------------------------------------
	{
		tagType: "impacted_downstream",
		tagTitle: "Sales",
		description: "Sales Reporting",
	},
	{
		tagType: "impacted_downstream",
		tagTitle: "CRM",
		description: "Impacts CRM data quality, analytics, and reporting processes.",
	},
	{
		tagType: "impacted_downstream",
		tagTitle: "CRM_CUSTOMER",
		description: "Impacts CRM customer master data used in analytics and reporting.",
	},
	{
		tagType: "impacted_downstream",
		tagTitle: "CRM_ADDRESS",
		description: "Impacts CRM customer address data used for reporting and location-based analysis.",
	},
];

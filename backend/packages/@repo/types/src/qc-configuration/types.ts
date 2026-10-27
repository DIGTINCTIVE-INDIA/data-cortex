import { SupportedFileStorageEnum } from "../common/types.js";

export type SourceFileType = "csv" | "excel" | "json";

export type GetFileStorageCheckSchemaPayload = {
	checkName: string;
	workstreamId: number;
	categoryId: number;
	dataSourceId: number;
	description?: string;
	impactedDownstreamIds: number[];
	sourceConnectionId: string;
	sourceFileType: SourceFileType;
	sourceFileName: string;
	sourceFilePath: string;
	// Left out, the delimiter of a csv is detected from its header line.
	sourceFileDelimiter?: "comma" | "pipe" | "tab" | "semicolon";
	targetConnectionId: string;
	targetTableNamePrefix: string;
	createLanding: boolean;
	// Only needed if createLanding is true
	landingTable?: string;
	fileAvailableOn: SupportedFileStorageEnum;
};

export type FileRow = Record<string, unknown>;

export type InferredDataType = "null" | "boolean" | "integer" | "decimal" | "date" | "datetime" | "string";

export type ColumnSchema = {
	columnName: string;
	columnOrder: number;
	dataType: InferredDataType;
	nullable: boolean;
};

export type FileStorageCheckSchemaResult = {
	fileName: string;
	sourceFileType: SourceFileType;
	sourceConnectionId: string;
	rowsScanned: number;
	columns: ColumnSchema[];
	// For a csv: the delimiter the file was read with (the one given, or the one detected).
	sourceFileDelimiter?: "comma" | "pipe" | "tab" | "semicolon";
};

export type ValidateQueryPayload = {
	sourceConnectionId: string;
	sqlQuery: string;
};

export type CreateCustomSqlCheckPayload = {
	checkName: string;
	checkDescription?: string;

	categoryId: number;
	workstreamId: number;
	impactedDownstreamIds: number[];
	dataSourceId: number;

	sourceConnectionId: string;
	targetConnectionId: string;

	targetTablePrefix: string;
	sqlQuery: string;
	criticality: "low" | "medium" | "high";
	/** Required: error_message is NOT NULL. Shown when the check fails. */
	errorMessage: string;
};

export type UpdateCustomSqlCheckPayload = Partial<CreateCustomSqlCheckPayload>;

export type SqlEditorColumn = {
	columnName: string;
	dataType: string;
	nullable: boolean;
	position: number;
};

export type SqlEditorTable = {
	tableName: string;
	columns: SqlEditorColumn[];
};

export type SqlEditorSchema = {
	schemaName: string;
	tables: SqlEditorTable[];
};

export * from "./qc.file.types.js";

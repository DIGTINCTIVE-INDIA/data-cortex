import { SupportedFileStorageEnum } from "../common/types.js";
import { SourceFileType } from "./types.js";

export type CheckCriticality = "low" | "medium" | "high";

export type CreateFileStorageCheckConfigPayload = {
	userId: string;
	config: {
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
		sourceFileDelimiter?: "comma" | "pipe" | "tab" | "semicolon";

		targetConnectionId: string;
		targetTableNamePrefix: string;

		createLanding: boolean;
		landingTable?: string;

		fileAvailableOn: SupportedFileStorageEnum;
	};
	columns: TraditionalColumnCheckPayload[];
};

export type TraditionalDataType = "string" | "integer" | "float" | "date" | "datetime" | "boolean" | "varchar";

export type TraditionalColumnCheckPayload = {
	field: string;
	dataType: TraditionalDataType;
	columnOrder: number;

	primaryKeyCheck?: boolean;
	primaryKeyCheckCriticality?: CheckCriticality;

	nullCheck?: boolean;
	nullCheckCriticality?: CheckCriticality;

	duplicateCheck?: boolean;
	duplicateCheckCriticality?: CheckCriticality;

	lengthCheck?: boolean;
	minLength?: number;
	maxLength?: number;
	lengthCheckCriticality?: CheckCriticality;

	formatCheck?: boolean;
	formatRegex?: string;
	formatCheckCriticality?: CheckCriticality;

	lovCheck?: boolean;
	lovs?: string;
	lovCheckCriticality?: CheckCriticality;

	riCheck?: boolean;
	riConnectionId?: string;
	riReferenceTable?: string;
	riFieldName?: string;
	riCheckCriticality?: CheckCriticality;
};

/**
 * Field rules attached to an existing db-based check.
 *
 * db-based and file-based checks share the traditional_config_details table, so
 * they share TraditionalColumnCheckPayload above.
 */
export type SetDbCheckColumnsPayload = {
	configId: string;
	columns: TraditionalColumnCheckPayload[];
};

export type UpdateFileStorageCheckConfigPayload = {
	checkName?: string;
	workstreamId?: number;
	categoryId?: number;
	dataSourceId?: number;
	impactedDownstreamIds?: number[];

	sourceConnectionId?: string;
	sourceFileType?: SourceFileType;
	sourceFileName?: string;
	sourceFilePath?: string;
	sourceFileDelimiter?: "comma" | "pipe" | "tab" | "semicolon";

	targetConnectionId?: string;
	targetTableNamePrefix?: string;

	createLanding?: boolean;
	landingTable?: string;

	fileAvailableOn: SupportedFileStorageEnum;
};

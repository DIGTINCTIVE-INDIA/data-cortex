import type { SupportedDatabasesEnum } from "../common/types.js";
import type { ConnectionAdditionalParam, SecretType } from "../connection/types.js";

export type DBExplorerConnection = {
	connectionId: string;
	connectionName: string;
	databaseType: SupportedDatabasesEnum;
	host: string;
	port: number;
	databaseName: string;
	username: string;
	secret: string;
	secretType?: SecretType;
	dbSchema: string;
	additionalParams?: ConnectionAdditionalParam | null;
	userId?: string | null;
	// ssl: boolean;
};

export type ExecuteDBExplorerQueryPayload = {
	sqlQuery: string;
};

export type DBExplorerColumn = {
	key: string;
	label: string;
	type?: string;
};

export type DBExplorerRow = Record<string, unknown>;

export type DBExplorerQueryResult = {
	rows: DBExplorerRow[];
	columns: DBExplorerColumn[];
	executedAt: string;
	pagination: {
		page: number;
		pageSize: number;
		returnedRows: number;
		offset: number;
		hasMore: boolean;
		maxPageSize: number;
	};
};

export type ExecuteDbExplorerQueryPayload = {
	sqlQuery: string;
	page?: number;
	pageSize?: number;
};

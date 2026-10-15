export type DBExplorerColumn = {
  key: string;
  label: string;
  type?: string;
};

export type DBExplorerRow = Record<string, unknown>;

export type ExecuteDbExplorerQueryPayload = {
  sqlQuery: string;
  page?: number;
  pageSize?: number;
};

export type DBExplorerQueryPagination = {
  page: number;
  pageSize: number;
  returnedRows: number;
  offset: number;
  hasMore: boolean;
  maxPageSize: number;
};

export type DBExplorerQueryResult = {
  rows: DBExplorerRow[];
  columns: DBExplorerColumn[];
  pagination: DBExplorerQueryPagination;
  executedAt: string;
};

export type DBExplorerConnection = {
  connectionId: string;
  connectionName?: string | null;
  databaseType: "postgres" | "snowflake" | string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  dbSchema: string;
};

export type ExecuteQueryMutationBody = ExecuteDbExplorerQueryPayload;

export type ExecuteQueryMutationResponse = {
  result: DBExplorerQueryResult;
};

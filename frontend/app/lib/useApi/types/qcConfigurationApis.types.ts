export type CreateDBQCConfigurationMutationBody = {
  description?: string | undefined;
  landingTable?: string | undefined;
  checkName: string;
  workstreamId: number;
  categoryId: number;
  dataSourceId: number;
  impactedDownstreamIds: number[];
  sourceDbId: string;
  sourceTableName: string;
  targetConnectionId: string;
  targetTableNamePrefix: string;
  createLanding: boolean;
};

export type CreateFileQCConfigurationMutationBody = {
  fileAvailableOn: "s3";
  landingTable?: string | undefined;
  checkName: string;
  workstreamId: number;
  categoryId: number;
  dataSourceId: number;
  impactedDownstreamIds: number[];
  sourceConnectionId: string;
  sourceFileName: string;
  sourceFilePath: string;
  sourceFileType: string;
  targetConnectionId: string;
  targetTableNamePrefix: string;
  createLanding: boolean;
};

type TabValue = "file" | "sql" | "kpi";

export type ConfiguredDbCheckItem = {
  configId: string;
  checkCategory: number;
  configName: string;
  enabled: boolean;
  workstream: number;
  dataSource: number;
  sourceConnectionId: string;
  targetConnectionId: string;
  targetTablePrefix: string;
  sourceTableName: string;
  landingTable: boolean;
  landingTableName: string;
  status: "Active" | "Draft";
  type: TabValue;
  createdAt: string;
  updatedAt: string;
  userId: string;
  impactedDownstream: number[];
  deactivatedAt: string | null;
};

export type ConfiguredFileCheckItem = {
  configId: string;
  configName: string;
  checkCategory: number;
  workstream: number;
  impactedDownstream: number[];
  dataSource: number;
  sourceConnectionId: string;
  sourceFileType: string;
  sourceFileDelimiter: any;
  sourceFileName: string;
  sourceFilePath: string;
  targetConnectionId: string;
  targetTablePrefix: string;
  landingTable: false;
  landingTableName: null;
  enabled: boolean;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

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

export type GetCustomSqlEditorSchemaQuery = {
  connectionId: string;
};

export type GetCustomSqlEditorSchemaResponse = {
  result: {
    connectionId: string;
    databaseName: string;
    schemas: SqlEditorSchema[];
  };
};

export type CreateCustomSqlCheckMutationBody = {
  checkDescription?: string | undefined;
  categoryId: number;
  workstreamId: number;
  dataSourceId: number;
  sourceConnectionId: string;
  targetConnectionId: string;
  targetTablePrefix: string;
  checkName: string;
  impactedDownstreamIds: number[];
  sqlQuery: string;
  criticality: string;
  errorMessage: string;
};

export type ValidateCustomSqlQueryMutationBody = {
  sourceConnectionId: string;
  sqlQuery: string;
};

export type ValidateCustomSqlQueryResponse = {
  valid: boolean;
  rowsReturned: number;
  columns: {
    name: string;
    dataTypeId: number;
  }[];
};

export type CustomSqlCheckItem = {
  checkId: string;
  checkName: string;
  checkDescription: string | null;
  checkCategory: number;
  workstream: number;
  impactedDownstream: number[];
  dataSource: number;
  sourceConnectionId: string;
  targetConnectionId: string;
  targetTablePrefix: string;
  sqlQuery: string;
  criticality: string;
  errorMessage: string;
  enabled: boolean;
};

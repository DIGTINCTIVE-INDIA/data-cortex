export type DatabaseType = "postgres" | "snowflake";

/** What the stored `secret` actually is. */
export type SecretType = "password" | "key_pair";

export type CreatePostgresConnectionMutationBody = {
  // additionalParams?: string | undefined;
  connectionName: string;
  databaseType: "postgres";
  host: string;
  port: number;
  databaseName: string;
  username: string;
  secret: string;
  secretType: SecretType;
  dbSchema: string;
  additionalParams: {
    ssl: boolean;
  };
};

export type CreateSnowflakeConnectionMutationBody = {
  additionalParams?: {
    account?: string;
    warehouse?: string;
    role?: string;
    privateKeyPassphrase?: string;
    auth_method?: SecretType;
  };
  connectionName: string;
  databaseType: "snowflake";

  // map Snowflake account identifier here for backend compatibility
  host: string;

  // Snowflake commonly uses HTTPS/443
  port: number;

  databaseName: string;
  username: string;
  /** A password or a PEM private key -- secretType says which. */
  secret: string;
  secretType: SecretType;
  dbSchema: string;
};

export type CreateDBConnectionMutationBody =
  | CreatePostgresConnectionMutationBody
  | CreateSnowflakeConnectionMutationBody;

export type DBConnectionItem = {
  connectionId: string;
  connectionName: string;
  databaseType: DatabaseType;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  dbSchema: string;

  additionalParams: {
    ssl: boolean;
  };
  enabled: boolean;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GetTablesQueryResponse = {
  tables: string[];
};
type columnData = {
  columnName: string;
  dataType: string;
  isNullable: boolean;
};
export type GetColumnsQueryResponse = {
  columns: columnData[];
};

export type CreateFileConnectionMutationBody = {
  additionalParams?: string | undefined;
  endpointUrl?: string | undefined;
  connectionName: string;
  storageType: "s3";
  bucketOrContainerName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type FileConnectionItem = {
  connectionId: string;
  connectionName: string;
  storageType: string;
  bucketOrContainerName: string;
  region: string;
  accessKeyId: string;
  endpointUrl: string | null;
};

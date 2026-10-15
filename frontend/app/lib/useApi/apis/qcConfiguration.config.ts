import type { ApiObj, PaginatedResponse, QueryResponse } from "../types/common.types";
import type {
  ConfiguredDbCheckItem,
  ConfiguredFileCheckItem,
  CreateCustomSqlCheckMutationBody,
  CreateDBQCConfigurationMutationBody,
  CreateFileQCConfigurationMutationBody,
  CustomSqlCheckItem,
  GetCustomSqlEditorSchemaResponse,
  ValidateCustomSqlQueryMutationBody,
} from "../types/qcConfigurationApis.types";

/** Body for POST /api/qc-configuration/run. `configId` carries check_id for custom-sql. */
export type RunCheckMutationBody = {
  configId: string;
  source: "db" | "file" | "custom-sql";
  /** Page-scoped de-duplication token; see useRunCheck.ts. */
  idempotencyKey?: string;
};

export type TraditionalColumnRule = {
  field: string;
  dataType: "string" | "integer" | "float" | "date" | "datetime" | "boolean" | "varchar";
  columnOrder: number;

  primaryKeyCheck: boolean;
  primaryKeyCheckCriticality?: string | null;
  nullCheck: boolean;
  nullCheckCriticality?: string | null;
  duplicateCheck: boolean;
  duplicateCheckCriticality?: string | null;
  lengthCheck: boolean;
  expectedLength?: number | null;
  lengthCheckCriticality?: string | null;
  formatCheck: boolean;
  formatRegex?: string | null;
  formatCheckCriticality?: string | null;
  lovCheck: boolean;
  lovs?: string | null;
  lovCheckCriticality?: string | null;
  riCheck: boolean;
  riConnectionId?: string | null;
  riReferenceTable?: string | null;
  riFieldName?: string | null;
  riCheckCriticality?: string | null;
};

export type SetDbCheckColumnsMutationBody = {
  configId: string;
  columns: TraditionalColumnRule[];
};

const qcConfigurationApisConfig = {
  // DB QC
  "GET /api/qc-configuration/db/list-checks": {
    type: "infinite",
    protected: true,
    revalidateOnSuccess: [],
    responseType: undefined as unknown as PaginatedResponse<ConfiguredDbCheckItem>,
    staleTime: "5",
  },
  "POST /api/qc-configuration/db/create-check": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/qc-configuration/db/list-checks"],
    mutationBody: undefined as unknown as CreateDBQCConfigurationMutationBody,
    responseType: undefined as unknown as any,
  },
  "PATCH /api/qc-configuration/db/update-check": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/qc-configuration/db/list-checks"],
    query: undefined as unknown as {
      configId: string;
    },
    mutationBody: undefined as unknown as Partial<CreateDBQCConfigurationMutationBody>,
    responseType: undefined as unknown as any,
  },
  "PATCH /api/qc-configuration/db/toggle-check": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/qc-configuration/db/list-checks"],
    query: undefined as unknown as {
      configId: string;
    },
    mutationBody: undefined as unknown as any,
    responseType: undefined as unknown as any,
  },

  // FIle Storage QC
  "POST /api/qc-configuration/file-storage/get-schema": {
    type: "mutation",
    mutationBody: undefined as unknown as CreateFileQCConfigurationMutationBody,
    responseType: undefined as unknown as any,
    protected: true,
    revalidateOnSuccess: [],
    retry: 0,
  },

  "GET /api/qc-configuration/file-storage/list-checks": {
    type: "infinite",
    responseType: undefined as unknown as PaginatedResponse<ConfiguredFileCheckItem>,
    protected: true,
    revalidateOnSuccess: [],
    staleTime: "5",
  },

  "PATCH /api/qc-configuration/file-storage/toggle-check": {
    type: "mutation",
    protected: true,
    query: undefined as unknown as {
      configId: string;
    },
    responseType: undefined as unknown as any,
    revalidateOnSuccess: ["GET /api/qc-configuration/file-storage/list-checks"],
    mutationBody: undefined as unknown as any,
  },
  "PATCH /api/qc-configuration/file-storage/update-check": {
    type: "mutation",
    protected: true,
    query: undefined as unknown as {
      configId: string;
    },
    responseType: undefined as unknown as any,
    revalidateOnSuccess: ["GET /api/qc-configuration/file-storage/list-checks"],
    mutationBody: undefined as unknown as Partial<CreateFileQCConfigurationMutationBody>,
  },
  "POST /api/qc-configuration/file-storage/create-check": {
    type: "mutation",
    protected: true,
    responseType: undefined as unknown as any,
    revalidateOnSuccess: ["GET /api/qc-configuration/file-storage/list-checks"],
    mutationBody: undefined as unknown as any,
  },

  // Custom SQL QC

  "GET /api/qc-configuration/custom-sql/schema": {
    type: "query",
    protected: true,
    revalidateOnSuccess: [],
    query: undefined as unknown as { connectionId: string },
    responseType: undefined as unknown as QueryResponse<GetCustomSqlEditorSchemaResponse>,
    staleTime: "5",
    retry: 0,
  },

  "POST /api/qc-configuration/custom-sql/create-check": {
    type: "mutation",
    protected: true,
    mutationBody: undefined as unknown as CreateCustomSqlCheckMutationBody,
    responseType: undefined as unknown as any,
    revalidateOnSuccess: ["GET /api/qc-configuration/custom-sql/list-checks"],
  },

  "POST /api/qc-configuration/custom-sql/validate-query": {
    type: "mutation",
    protected: true,
    mutationBody: undefined as unknown as ValidateCustomSqlQueryMutationBody,
    responseType: undefined as unknown as any,
    revalidateOnSuccess: [],
  },

  "GET /api/qc-configuration/custom-sql/list-checks": {
    type: "infinite",
    protected: true,
    responseType: undefined as unknown as PaginatedResponse<CustomSqlCheckItem>,
    staleTime: "5",
  },
  "PATCH /api/qc-configuration/custom-sql/toggle-check": {
    type: "mutation",
    protected: true,
    query: undefined as unknown as {
      checkId: string;
    },
    responseType: undefined as unknown as any,
    revalidateOnSuccess: ["GET /api/qc-configuration/custom-sql/list-checks"],
    mutationBody: undefined as unknown as any,
  },

  "PATCH /api/qc-configuration/custom-sql/update-check": {
    type: "mutation",
    protected: true,
    query: undefined as unknown as {
      checkId: string;
    },
    responseType: undefined as unknown as any,
    revalidateOnSuccess: ["GET /api/qc-configuration/custom-sql/list-checks"],
    mutationBody: undefined as unknown as any,
  },
  // RUN a configured check (db / file / custom-sql)
  "POST /api/qc-configuration/run": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: [],
    mutationBody: undefined as unknown as RunCheckMutationBody,
    responseType: undefined as unknown as any,
  },
  // Field-level rules for a db-based check, saved after the check itself exists.
  "POST /api/qc-configuration/db/set-columns": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/qc-configuration/db/list-columns"],
    mutationBody: undefined as unknown as SetDbCheckColumnsMutationBody,
    responseType: undefined as unknown as any,
  },
  "GET /api/qc-configuration/db/list-columns": {
    type: "query",
    protected: true,
    revalidateOnSuccess: [],
    query: undefined as unknown as { configId: string },
    responseType: undefined as unknown as any,
  },
} as const satisfies ApiObj;

export default qcConfigurationApisConfig;

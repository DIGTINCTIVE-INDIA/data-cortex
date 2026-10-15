import type { ApiObj, MutationResponse, PaginatedResponse, QueryResponse } from "../types/common.types";
import type {
  CreateDBConnectionMutationBody,
  CreateFileConnectionMutationBody,
  DBConnectionItem,
  GetColumnsQueryResponse,
  GetTablesQueryResponse,
} from "../types/connectionApis.types";

const connectionsApiConfig = {
  /* ================= DB CONNECTIONS ================= */

  "GET /api/db/connections/tables": {
    type: "query",
    protected: true,
    revalidateOnSuccess: [],
    query: undefined as unknown as { connectionId: string },
    responseType: undefined as unknown as QueryResponse<GetTablesQueryResponse>,
    staleTime: "5",
  },

  "GET /api/db/connections/columns": {
    type: "query",
    protected: true,
    revalidateOnSuccess: [],
    query: undefined as unknown as { connectionId: string; tableName: string },
    responseType: undefined as unknown as QueryResponse<GetColumnsQueryResponse>,
    staleTime: "5",
  },

  "GET /api/db/connections/list": {
    type: "infinite",
    protected: true,
    revalidateOnSuccess: [],
    responseType: undefined as unknown as PaginatedResponse<DBConnectionItem>,
    staleTime: "5",
  },

  "POST /api/db/connections/add": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/db/connections/list"],
    mutationBody: undefined as unknown as CreateDBConnectionMutationBody,
    responseType: undefined as unknown as MutationResponse<any>,
  },

  "PATCH /api/db/connections/update": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/db/connections/list"],
    query: undefined as unknown as { connectionId: string },
    mutationBody: undefined as unknown as any,
    responseType: undefined as unknown as MutationResponse<any>,
  },

  "PATCH /api/db/connections/toggle": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/db/connections/list"],
    query: undefined as unknown as { connectionId: string },
    responseType: undefined as unknown as MutationResponse<{ success: boolean }>,
  },

  "GET /api/db/connections/list?page=1&limit=500": {
    type: "query",
    protected: true,
    revalidateOnSuccess: [],
    responseType: undefined as unknown as PaginatedResponse<DBConnectionItem>,
    staleTime: "5",
  },

  /* ================= FILE STORAGE CONNECTIONS ================= */

  "GET /api/file-storage/connections/list": {
    type: "infinite",
    protected: true,
    revalidateOnSuccess: [],
    responseType: undefined as unknown as PaginatedResponse<any>,
    staleTime: "5",
  },

  "POST /api/file-storage/connections/add": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/file-storage/connections/list"],
    mutationBody: undefined as unknown as any,
    responseType: undefined as unknown as MutationResponse<CreateFileConnectionMutationBody>,
  },

  "PATCH /api/file-storage/connections/update": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/file-storage/connections/list"],
    query: undefined as unknown as { connectionId: string },
    mutationBody: undefined as unknown as any,
    responseType: undefined as unknown as MutationResponse<any>,
  },

  "PATCH /api/file-storage/connections/toggle": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/file-storage/connections/list"],
    query: undefined as unknown as { connectionId: string },
    responseType: undefined as unknown as MutationResponse<{ success: boolean }>,
  },

   "GET /api/file-storage/connections/list?page=1&limit=500": {
    type: "query",
    protected: true,
    revalidateOnSuccess: [],
    responseType: undefined as unknown as PaginatedResponse<any>,
    staleTime: "5",
  },
} as const satisfies ApiObj;

export default connectionsApiConfig;

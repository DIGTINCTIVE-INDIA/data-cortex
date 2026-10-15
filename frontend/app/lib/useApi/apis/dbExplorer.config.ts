import type { ApiObj, MutationResponse } from "../types/common.types";
import type { ExecuteQueryMutationBody, ExecuteQueryMutationResponse } from "../types/dbExplorer.types";

const dbExplorerApiConfig = {
  "POST /api/db-explorer/execute-query": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: [],
    retry: 0,
    query: undefined as unknown as { connectionId: string },
    mutationBody: undefined as unknown as ExecuteQueryMutationBody,
    responseType: undefined as unknown as MutationResponse<ExecuteQueryMutationResponse>,
  },
} as const satisfies ApiObj;

export default dbExplorerApiConfig;

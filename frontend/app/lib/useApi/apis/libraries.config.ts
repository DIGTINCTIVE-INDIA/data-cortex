import type { ApiObj, MutationResponse, PaginatedResponse, QueryResponse } from "../types/common.types";
import type {
  AddMutationBody,
  AllLibrariesResponse,
  DqCheckSource,
  LibraryItems,
} from "../types/librariesApis.types";

const librariesApiConfig = {
  "GET /api/libraries/qc-tags/all": {
    type: "query",
    protected: true,
    revalidateOnSuccess: [],
    responseType: undefined as unknown as QueryResponse<AllLibrariesResponse>,
    staleTime: "5",
  },

  "GET /api/libraries/dq-checks/sources": {
    type: "query",
    protected: true,
    revalidateOnSuccess: [],
    responseType: undefined as unknown as QueryResponse<{ sources: DqCheckSource[] }>,
    staleTime: "1",
  },

  "GET /api/libraries/qc-tags/:type": {
    type: "infinite",
    protected: true,
    query: undefined as unknown as { page_size: number },
    revalidateOnSuccess: [],
    responseType: undefined as unknown as PaginatedResponse<LibraryItems>,
    staleTime: "5",
  },

  "POST /api/libraries/qc-tags/create": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/libraries/qc-tags/all", "GET /api/libraries/qc-tags/:type"],
    mutationBody: undefined as unknown as AddMutationBody,
    responseType: undefined as unknown as MutationResponse<{ item: LibraryItems }>,
  },
  "PATCH /api/libraries/qc-tags/update": {
    type: "mutation",
    protected: true,
    query: undefined as unknown as { id: number },
    revalidateOnSuccess: ["GET /api/libraries/qc-tags/all", "GET /api/libraries/qc-tags/:type"],
    mutationBody: undefined as unknown as AddMutationBody,
    responseType: undefined as unknown as MutationResponse<{ item: LibraryItems }>,
  },
  "PATCH /api/libraries/qc-tags/toggle": {
    type: "mutation",
    protected: true,
    query: undefined as unknown as { id: number },
    revalidateOnSuccess: ["GET /api/libraries/qc-tags/all", "GET /api/libraries/qc-tags/:type"],
    mutationBody: undefined as unknown as any,
    responseType: undefined as unknown as any,
  },
} as const satisfies ApiObj;

export default librariesApiConfig;

import type {
  WorkstreamBaseQuery,
  WorkstreamCheckCardsResponse,
  WorkstreamDistinctCheckTypesResponse,
  WorkstreamDistinctFileTableNamesResponse,
  WorkstreamFailedChecksTableResponse,
  WorkstreamFailedTrendResponse,
} from "../types/analyseWorkstreamApis.types";
import type { ApiObj, PaginatedResponse, QueryResponse } from "../types/common.types";

const analyseWorkstreamApiConfig = {
  "GET /api/analyse-workstreams/distinct-check-types": {
    type: "query",
    protected: true,
    retry: 0,
    query: undefined as unknown as WorkstreamBaseQuery,
    responseType: undefined as unknown as QueryResponse<WorkstreamDistinctCheckTypesResponse>,
  },

  "GET /api/analyse-workstreams/distinct-file-table-names": {
    type: "query",
    protected: true,
    retry: 0,
    query: undefined as unknown as WorkstreamBaseQuery,
    responseType: undefined as unknown as QueryResponse<WorkstreamDistinctFileTableNamesResponse>,
  },

  "GET /api/analyse-workstreams/check-cards": {
    type: "query",
    protected: true,
    retry: 0,
    query: undefined as unknown as WorkstreamBaseQuery,
    responseType: undefined as unknown as QueryResponse<WorkstreamCheckCardsResponse>,
  },

  "GET /api/analyse-workstreams/failed-trend": {
    type: "query",
    protected: true,
    retry: 0,
    query: undefined as unknown as WorkstreamBaseQuery,
    responseType: undefined as unknown as QueryResponse<WorkstreamFailedTrendResponse>,
  },

  "GET /api/analyse-workstreams/failed-checks-table": {
    type: "paginated",
    protected: true,
    retry: 0,
    query: undefined as unknown as WorkstreamBaseQuery,
    responseType: undefined as unknown as PaginatedResponse<WorkstreamFailedChecksTableResponse>,
  },

  "GET /api/analyse-workstreams/checks/:id/details": {
    type: "query",
    protected: true,
    retry: 0,
    query: undefined as unknown as {
      view: any;
    },
    responseType: undefined as unknown as QueryResponse<any>,
  },
} as const satisfies ApiObj;

export default analyseWorkstreamApiConfig;

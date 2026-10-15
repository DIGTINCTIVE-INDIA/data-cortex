// reportsApis.config.ts
import type { ApiObj, QueryResponse } from "../types/common.types";
import type {
  DashboardBaseQuery,
  DashboardIssuesBySourceResponse,
  DashboardIssuesStatusResponse,
  DashboardIssuesTableResponse,
  DashboardIssuesTrendQuery,
  DashboardIssuesTrendResponse,
  DashboardSummaryResponse,
} from "../types/dashboardApis.types";

const dashboardApiConfig = {
  "GET /api/dashboard/summary": {
    type: "query",
    protected: true,
    retry: 0,
    query: undefined as unknown as DashboardBaseQuery,
    responseType: undefined as unknown as QueryResponse<DashboardSummaryResponse>,
  },

  "GET /api/dashboard/issues-status": {
    type: "query",
    protected: true,
    retry: 0,
    query: undefined as unknown as DashboardBaseQuery,
    responseType: undefined as unknown as QueryResponse<DashboardIssuesStatusResponse>,
  },

  "GET /api/dashboard/issues-by-source": {
    type: "query",
    protected: true,
    retry: 0,
    query: undefined as unknown as DashboardBaseQuery,
    responseType: undefined as unknown as QueryResponse<DashboardIssuesBySourceResponse>,
  },

  "GET /api/dashboard/issues-trend": {
    type: "query",
    protected: true,
    retry: 0,
    query: undefined as unknown as DashboardIssuesTrendQuery,
    responseType: undefined as unknown as QueryResponse<DashboardIssuesTrendResponse>,
  },

  "GET /api/dashboard/issues-table": {
    type: "query",
    protected: true,
    retry: 0,
    query: undefined as unknown as DashboardBaseQuery,
    responseType: undefined as unknown as QueryResponse<DashboardIssuesTableResponse>,
  },
} as const satisfies ApiObj;

export default dashboardApiConfig;

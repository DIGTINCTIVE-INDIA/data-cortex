import type { ApiObj, QueryResponse } from "../types/common.types";
import type { QcSummaryQuery, QcSummaryReportResponse } from "../types/reportsApis.types";

const reportsApiConfig = {
  "GET /api/reports/qc-summary": {
    type: "query",
    protected: true,
    retry: 0,
    query: undefined as unknown as QcSummaryQuery,
    responseType: undefined as unknown as QueryResponse<QcSummaryReportResponse>,
  },
} as const satisfies ApiObj;

export default reportsApiConfig;

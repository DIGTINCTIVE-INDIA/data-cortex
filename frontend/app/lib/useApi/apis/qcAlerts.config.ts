import type { ApiObj, PaginatedResponse, QueryResponse } from "../types/common.types";
import type { QcAlertItems, QcAlertsQuery, QCSummary, UpdateQcAlertMutationBody } from "../types/qcAlerts.types";

const qcAlertsApiConfig = {
  "GET /api/reports/qc-alerts": {
    type: "infinite",
    protected: true,
    retry: 0,
    query: undefined as unknown as QcAlertsQuery,
    responseType: undefined as unknown as PaginatedResponse<QcAlertItems>,
  },
  "GET /api/reports/qc-alerts/summary": {
    type: "query",
    protected: true,
    retry: 0,
    query: undefined as unknown as QcAlertsQuery,
    responseType: undefined as unknown as QueryResponse<QCSummary>,
  },

  "PATCH /api/reports/qc-alerts/:id/status": {
    type: "mutation",
    protected: true,
    query: undefined as unknown as {
      id: number;
    },
    responseType: undefined as unknown as any,
    revalidateOnSuccess: ["GET /api/reports/qc-alerts", "GET /api/reports/qc-alerts/summary"],
    mutationBody: undefined as unknown as UpdateQcAlertMutationBody,
  },
} as const satisfies ApiObj;

export default qcAlertsApiConfig;

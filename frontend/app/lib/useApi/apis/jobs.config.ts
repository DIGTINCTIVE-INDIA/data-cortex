import type { ApiObj, PaginatedResponse, QueryResponse } from "../types/common.types";
import type { JobDetail, JobItem, JobStatus } from "../types/jobsApis.types";

const jobsApiConfig = {
  "GET /api/jobs": {
    type: "query",
    protected: true,
    revalidateOnSuccess: [],
    query: undefined as unknown as { page?: number; limit?: number; status?: JobStatus; configId?: string },
    responseType: undefined as unknown as PaginatedResponse<JobItem>,
    // A running job changes state under the page; the page polls while one is open.
    staleTime: "0",
  },

  "GET /api/jobs/:runId": {
    type: "query",
    protected: true,
    revalidateOnSuccess: [],
    responseType: undefined as unknown as QueryResponse<{ job: JobDetail }>,
    staleTime: "0",
  },
} as const satisfies ApiObj;

export default jobsApiConfig;

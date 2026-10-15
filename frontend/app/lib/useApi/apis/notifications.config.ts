import type { ApiObj, MutationResponse, PaginatedResponse } from "../types/common.types";
import type {
  NotificationRule,
  NotificationRuleMutationBody,
  TestEmailMutationBody,
} from "../types/notificationsApis.types";

const notificationsApiConfig = {
  /**
   * Rules are few and the page filters them client-side, so they are fetched in
   * one go rather than page by page -- same approach as the connections lists.
   */
  "GET /api/notifications/rules?page=1&limit=500": {
    type: "query",
    protected: true,
    revalidateOnSuccess: [],
    responseType: undefined as unknown as PaginatedResponse<NotificationRule>,
    staleTime: "0",
  },

  "POST /api/notifications/rules": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/notifications/rules?page=1&limit=500"],
    mutationBody: undefined as unknown as NotificationRuleMutationBody,
    responseType: undefined as unknown as MutationResponse<{ rule: NotificationRule }>,
  },

  "PATCH /api/notifications/rules": {
    type: "mutation",
    protected: true,
    query: undefined as unknown as { ruleId: string },
    revalidateOnSuccess: ["GET /api/notifications/rules?page=1&limit=500"],
    mutationBody: undefined as unknown as Partial<NotificationRuleMutationBody>,
    responseType: undefined as unknown as MutationResponse<{ rule: NotificationRule }>,
  },

  "PATCH /api/notifications/rules/toggle": {
    type: "mutation",
    protected: true,
    query: undefined as unknown as { ruleId: string },
    revalidateOnSuccess: ["GET /api/notifications/rules?page=1&limit=500"],
    responseType: undefined as unknown as MutationResponse<{ rule: NotificationRule }>,
  },

  "DELETE /api/notifications/rules": {
    type: "mutation",
    protected: true,
    query: undefined as unknown as { ruleId: string },
    revalidateOnSuccess: ["GET /api/notifications/rules?page=1&limit=500"],
    responseType: undefined as unknown as MutationResponse<{ ruleId: string }>,
  },

  "POST /api/notifications/test-email": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: [],
    mutationBody: undefined as unknown as TestEmailMutationBody,
    responseType: undefined as unknown as MutationResponse<{ sent: boolean; to: string }>,
  },
} as const satisfies ApiObj;

export default notificationsApiConfig;

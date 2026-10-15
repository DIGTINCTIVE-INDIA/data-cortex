import type { ApiObj, MutationResponse, QueryResponse } from "../types/common.types";
import type {
  CreateApiKeyBody,
  CreatedApiKey,
  CreateServiceUserBody,
  ServiceUser,
} from "../types/serviceUsersApis.types";

const serviceUsersApiConfig = {
  "GET /api/service-users": {
    type: "query",
    protected: true,
    revalidateOnSuccess: [],
    responseType: undefined as unknown as QueryResponse<{ serviceUsers: ServiceUser[] }>,
    // Key state (revoked, last used) changes outside this page, so always refetch.
    staleTime: "0",
  },

  "POST /api/service-users": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/service-users"],
    mutationBody: undefined as unknown as CreateServiceUserBody,
    responseType: undefined as unknown as MutationResponse<{ user: ServiceUser; key: CreatedApiKey }>,
  },

  "POST /api/service-users/:id/keys": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/service-users"],
    mutationBody: undefined as unknown as CreateApiKeyBody,
    responseType: undefined as unknown as MutationResponse<{ key: CreatedApiKey }>,
  },

  "DELETE /api/service-users/keys/:keyId": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/service-users"],
    responseType: undefined as unknown as MutationResponse<{ keyId: string }>,
  },
} as const satisfies ApiObj;

export default serviceUsersApiConfig;

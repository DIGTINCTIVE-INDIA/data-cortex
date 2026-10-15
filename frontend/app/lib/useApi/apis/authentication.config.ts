import type { ExchangeCodeMutationBody, TokenResponse } from "../types/authenticationApis.types";
import type { ApiObj, QueryResponse } from "../types/common.types";

const authenticationApiConfig = {
  "GET /api/auth/sso/url": {
    type: "query",
    protected: false,
    revalidateOnSuccess: [],
    responseType: undefined as unknown as any,
    staleTime: "5",
  },
  "POST /api/auth/sso/exchange-code": {
    type: "mutation",
    protected: false,
    revalidateOnSuccess: [],
    retry: 0,
    mutationBody: undefined as unknown as ExchangeCodeMutationBody,
    responseType: undefined as unknown as QueryResponse<TokenResponse>,
  },
  "GET /api/auth/token": {
    type: "query",
    protected: false,
    revalidateOnSuccess: [],
    responseType: undefined as unknown as QueryResponse<TokenResponse>,
    staleTime: "5",
  },
  "POST /api/auth/logout": {
    type: "mutation",
    protected: false,
    revalidateOnSuccess: [],
    mutationBody: undefined as unknown as any,
    responseType: undefined as unknown as any,
  },
} as const satisfies ApiObj;

export default authenticationApiConfig;

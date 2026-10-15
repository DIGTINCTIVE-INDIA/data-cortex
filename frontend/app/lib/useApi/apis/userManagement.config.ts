import type { ApiObj } from "../types/common.types";
import type { UpdateUserMutationBody } from "../types/userManagementApis.types";

const userManagementApiConfig = {
  "GET /api/user/list-users": {
    type: "infinite",
    protected: true,
    revalidateOnSuccess: [],
    responseType: undefined as unknown as any,
    staleTime: "5",
  },
  "POST /api/user/add-user": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/user/list-users"],
    mutationBody: undefined as unknown as any,
    responseType: undefined as unknown as any,
  },
  "POST /api/user/update-user": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/user/list-users"],
    query: undefined as unknown as {
      userId: string;
    },
    mutationBody: undefined as unknown as UpdateUserMutationBody,
    responseType: undefined as unknown as any,
  },
  "PATCH /api/user/toggle-user": {
    type: "mutation",
    protected: true,
    revalidateOnSuccess: ["GET /api/user/list-users"],
    query: undefined as unknown as {
      userId: string;
    },
    mutationBody: undefined as unknown as any,
    responseType: undefined as unknown as any,
  },
} as const satisfies ApiObj;

export default userManagementApiConfig;
undefined;

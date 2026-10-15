import type { UserRole } from "./authenticationApis.types";

export type UserResponse = {
  type: "paginated";
  success: boolean;
  data: {
    items: UserItem[];
    pagination: Pagination;
  };
};

export type UserItem = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: string;
  enabled: boolean;
  deactivatedAt: string | null;
};

export type Pagination = {
  total: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
};

export type UpdateUserMutationBody = {
  fullName?: string | undefined;
  role: UserRole;
};

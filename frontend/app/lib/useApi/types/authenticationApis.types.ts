export type UserRole = "admin" | "analyst" | "engineer" | "service";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TokenResponse = {
  user: SessionUser;
  accessToken: string;
};

export type ExchangeCodeMutationBody = {
  code: string;
};

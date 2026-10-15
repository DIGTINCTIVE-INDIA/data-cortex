export type ServiceApiKey = {
  id: string;
  userId: string;
  name: string;
  /** Not secret: the lookup handle, shown so a key can be recognised. */
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type ServiceUser = {
  id: string;
  fullName: string;
  email: string;
  enabled: boolean;
  createdAt: string;
  keys: ServiceApiKey[];
};

/** Returned once, on creation. The plaintext `key` is never retrievable again. */
export type CreatedApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  expiresAt: string | null;
  key: string;
};

export type CreateServiceUserBody = {
  name: string;
  expiresInDays?: number;
};

export type CreateApiKeyBody = {
  name: string;
  expiresInDays?: number;
};

import type { EndpointsEnum } from "../configs/api.endpoints";

export type EntityType = "HCP" | "HCO";

export type HTTP_METHOD = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type Paginated = {
  pageSize: number;
  currentPage: number;
  total: number;
  totalPages: number;
};

export type QueryResponse<T> = {
  type: "query";
  success: boolean;
  data: T;
};

export type PaginatedResponse<T> = {
  type: "paginated";
  success: boolean;
  data: {
    items: T[];
    pagination: Paginated;
  };
};

export type MutationResponse<T> = {
  type: "mutation";
  success: boolean;
  data?: T;
  toast: {
    type: "error" | "success";
    message: string;
    showToast: boolean;
  };
};

export type StaleTimeEnum = "0" | "1" | "5" | "15" | "30";

type BaseConfig<TResponse, TBody = unknown> = {
  protected?: boolean;
  /**
   * Time in minutes. Eg: `1min` , `5min` , `15min` etc.
   */
  staleTime?: StaleTimeEnum;
  revalidateOnSuccess?: readonly EndpointsEnum[];
  triggerOnSuccess?: readonly EndpointsEnum[];
  query?: Record<string, any>;
  responseType?: TResponse;
  select?: (data: TResponse) => TResponse;
  /**
   * Retry count after request fails ...
   * default is `3`
   */
  retry?: number;
};

type QueryConfig<TResponse, TBody = unknown> = BaseConfig<TResponse, TBody> & {
  type: "query";
  defaultValue?: TResponse;
  bodyType?: TBody;
};

type MutationConfig<TResponse, TBody> = BaseConfig<TResponse, TBody> & {
  type: "mutation";
  mutationBody?: TBody;
};

type PaginatedConfig<T> = BaseConfig<PaginatedResponse<T>> & {
  type: "paginated";
  /**
   * Default value is `10`
   */
  pageSize?: number;

  defaultValue?: PaginatedResponse<T>;
};

type InfiniteConfig<T> = BaseConfig<PaginatedResponse<T>> & {
  type: "infinite";
  /**
   * Default value is `10`
   */
  pageSize?: number;

  defaultValue?: PaginatedResponse<T>;
};

export type ApiConfig<TResponse = any, TBody = any> =
  | QueryConfig<TResponse, TBody>
  | MutationConfig<TResponse, TBody>
  | PaginatedConfig<any>
  | InfiniteConfig<any>;

export type ApiObj = Partial<Record<EndpointsEnum, ApiConfig<any, any>>>;

export type FormattedTableResponse<T> = {
  headers: Array<{ title: string; key: string }>;
  data: T;
} | null;

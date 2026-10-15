// useApi/types.ts

import type { UseInfiniteQueryResult, UseMutationOptions } from "@tanstack/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { EndpointKeys } from "./apis";
import { apiConfig } from "./apis";

/* =========================================================
   CONFIG HELPERS
========================================================= */

export type Config<K extends EndpointKeys> = (typeof apiConfig)[K];

/* =========================================================
   PATH PARAM EXTRACTION
========================================================= */

// Extract ":id" | ":userId" from "/users/:id/posts/:postId"
export type ExtractPathParams<T extends string> = T extends `${string}:${infer Param}/${infer Rest}`
  ? Param | ExtractPathParams<Rest>
  : T extends `${string}:${infer Param}`
    ? Param
    : never;

// Extract "/users/:id" from "GET /users/:id"
export type ExtractPathFromKey<K extends EndpointKeys> = K extends `${string} ${infer Path}` ? Path : never;

// Final object type → { id: string | number }
export type PathParams<K extends EndpointKeys> = {
  [P in ExtractPathParams<ExtractPathFromKey<K>>]: string | number;
};

/* =========================================================
   BODY EXTRACTION
========================================================= */

export type ExtractBodyForOption<K extends EndpointKeys> =
  Config<K> extends { type: "mutation"; mutationBody: infer Body }
    ? Body
    : Config<K> extends { type: "query"; bodyType: infer Body }
      ? Body
      : never;

/* =========================================================
   QUERY TYPE EXTRACTION
========================================================= */

type ExtractQuery<K extends EndpointKeys> =
  Config<K> extends { query: infer Q extends Record<string, any> } ? Partial<Q> : Record<string, never>;

/* =========================================================
   MUTATION OPTIONS (EXTENDED)
========================================================= */

export type MutationCallOptions<K extends EndpointKeys> = Omit<
  UseMutationOptions<Config<K>["responseType"], Error, ExtractBodyForOption<K> | undefined>,
  "mutationFn"
> & {
  /** Optional query params (function-level override) */
  query?: ExtractQuery<K>;

  /** Optional path params override */
  params?: PathParams<K>;
};

/* =========================================================
   HOOK OPTIONS
========================================================= */

export interface UseApiOptions<K extends EndpointKeys> {
  params?: PathParams<K>;
  query?: ExtractQuery<K>;
  body?: ExtractBodyForOption<K>;
  enabled?: boolean;
  paginatedKeyName?: string;

  /**
   * Used for mutation api , extra api calls which are not stale
   * and cannot be refetched.
   */
  context?: Record<string, string | number | undefined>;
}

/* =========================================================
   UTIL TYPES
========================================================= */

export type SetData<T> = (updater: (old: T | undefined) => T | undefined) => void;

/* =========================================================
   MUTATION RETURN TYPE (OVERRIDDEN)
========================================================= */

type BaseMutationReturn<K extends EndpointKeys> = ReturnType<
  typeof useMutation<Config<K>["responseType"], Error, ExtractBodyForOption<K>>
>;

export type MutationReturn<K extends EndpointKeys> = Omit<BaseMutationReturn<K>, "mutate" | "mutateAsync"> & {
  mutate: (variables?: ExtractBodyForOption<K>, options?: MutationCallOptions<K>) => void;

  mutateAsync: (
    variables?: ExtractBodyForOption<K>,
    options?: MutationCallOptions<K>
  ) => Promise<Config<K>["responseType"]>;
};

/* =========================================================
   FINAL HOOK RETURN TYPE
========================================================= */

export type QueryReturn<K extends EndpointKeys> = ReturnType<typeof useQuery<Config<K>["responseType"]>> & {
  setData: SetData<Config<K>["responseType"]>;
  queryKey: readonly unknown[];
};

export type PaginatedReturn<K extends EndpointKeys> = QueryReturn<K> & {
  currentPage: number;
  setPage: (value: number) => void;
  pageSize: number;
  setPageSize: (value: number) => void;
};

export type InfiniteApiReturn<TData> = Omit<
  UseInfiniteQueryResult<TData, Error>,
  "data" | "isLoading" | "isError" | "error" | "isFetchingNextPage"
> & {
  data: TData | undefined;

  isInitialLoading: boolean;
  isInitialError: boolean;
  initialError: Error | null;

  isInfiniteLoading: boolean;
  isInfiniteError: boolean;
  infiniteError: Error | null;

  hasNextPage: boolean;
  fetchNextPage: () => Promise<any>;

  setData: (updater: TData | ((prev: TData | undefined) => TData | undefined)) => void;
};

export type UseApiReturn<K extends EndpointKeys> =
  Config<K> extends { type: "query" }
    ? QueryReturn<K>
    : Config<K> extends { type: "paginated" }
      ? PaginatedReturn<K>
      : Config<K> extends { type: "mutation" }
        ? MutationReturn<K>
        : Config<K>["type"] extends "infinite"
          ? InfiniteApiReturn<Config<K>["responseType"]>
          : never;

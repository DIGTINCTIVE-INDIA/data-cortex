// useApi/useInfinite.ts

import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { EndpointKeys } from "../apis";
import UseApiUtil from "../configs/useapi.util";
import type { Config, UseApiOptions } from "../types";
import type { HTTP_METHOD } from "../types/common.types";

const DEFAULT_PAGE_SIZE = 5;

type PaginationMeta = {
  currentPage: number;
  totalPages: number;
  pageSize?: number;
  totalItems?: number;
  [key: string]: any;
};

type PaginatedApiResponse<TItem = any> = {
  success: boolean;
  type?: "paginated" | string;
  data: {
    items: TItem[];
    pagination: PaginationMeta;
  };
};

type FlattenedInfiniteResponse<TItem = any> = {
  success: boolean;
  data: {
    items: TItem[];
    pagination: PaginationMeta | null;
    hasNextPage: boolean;
  };
};

type UseInfiniteArgs<K extends EndpointKeys> = {
  endpoint: K;
  method: string;
  basePath: string;
  axios: any;
  accessToken?: string | null;
  config: any;
  optionalConfig: any;
  options?: UseApiOptions<K>;
};

type InfiniteSetDataUpdater<K extends EndpointKeys> =
  | Config<K>["responseType"]
  | ((prev: Config<K>["responseType"] | undefined) => Config<K>["responseType"] | undefined);

const isUpdaterFunction = <K extends EndpointKeys>(
  updater: InfiniteSetDataUpdater<K>
): updater is (prev: Config<K>["responseType"] | undefined) => Config<K>["responseType"] | undefined => {
  return typeof updater === "function";
};

const removePaginationQueryKeys = (query?: Record<string, any>) => {
  if (!query) return undefined;

  const { page, page_size, limit, ...rest } = query;
  return rest;
};

const appendQueryParams = (sp: URLSearchParams, query?: Record<string, any>) => {
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach(item => {
        if (item !== undefined && item !== null) {
          sp.append(key, String(item));
        }
      });
    } else {
      sp.append(key, String(value));
    }
  });
};

const flattenInfiniteData = (
  infiniteData?: InfiniteData<PaginatedApiResponse>
): FlattenedInfiniteResponse | undefined => {
  if (!infiniteData?.pages?.length) return undefined;

  const pages = infiniteData.pages;
  const items = pages.flatMap(page => page?.data?.items ?? []);
  const lastPage = pages[pages.length - 1];

  const pagination = lastPage?.data?.pagination ?? null;

  return {
    success: lastPage?.success ?? true,
    data: {
      items,
      pagination,
      hasNextPage: pagination ? pagination.currentPage < pagination.totalPages : false,
    },
  };
};

function useInfinite<K extends EndpointKeys>({
  endpoint,
  method,
  basePath,
  axios,
  accessToken,
  config,
  optionalConfig,
  options,
}: UseInfiniteArgs<K>) {
  const queryClient = useQueryClient();

  const pageSize = Number((options?.query as any)?.limit ?? optionalConfig?.pageSize ?? DEFAULT_PAGE_SIZE);

  const cleanQuery = useMemo(() => removePaginationQueryKeys(options?.query as Record<string, any>), [options?.query]);

  const infiniteQueryKey = useMemo(
    () => [endpoint, options?.params, cleanQuery, options?.body, "infinite"] as const,
    [endpoint, options?.params, cleanQuery, options?.body]
  );

  const buildInfiniteUrl = useCallback(
    (page: number) => {
      let finalUrl = basePath;

      Object.entries(options?.params ?? {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          finalUrl = finalUrl.replace(`:${key}`, String(value));
        }
      });

      const sp = new URLSearchParams();

      sp.set("page", String(page));
      sp.set("limit", String(pageSize));

      appendQueryParams(sp, cleanQuery);

      const queryString = sp.toString();

      return queryString ? `${finalUrl}?${queryString}` : finalUrl;
    },
    [basePath, options?.params, pageSize, cleanQuery]
  );

  const requestInfinitePage = useCallback(
    async (page: number) => {
      const finalUrl = buildInfiniteUrl(page);

      const res = await axios({
        url: finalUrl,
        method: method as HTTP_METHOD,
        data: options?.body,
        headers: config.protected
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      });

      return res.data as PaginatedApiResponse;
    },
    [axios, buildInfiniteUrl, method, options?.body, config.protected, accessToken]
  );

  const infiniteQuery = useInfiniteQuery({
    queryKey: infiniteQueryKey,

    initialPageParam: 1,

    queryFn: ({ pageParam }) => {
      return requestInfinitePage(Number(pageParam));
    },

    getNextPageParam: lastPage => {
      const pagination = lastPage?.data?.pagination;

      if (!pagination) return undefined;

      const nextPage = pagination.currentPage + 1;

      return pagination.currentPage < pagination.totalPages ? nextPage : undefined;
    },

    enabled: options?.enabled ?? true,

    staleTime: UseApiUtil.formatTimeInMs(optionalConfig?.staleTime),

    retry: optionalConfig?.retry ?? 3,

    select: infiniteData => {
      const flattened = flattenInfiniteData(infiniteData as any);

      if (!flattened) {
        return flattened as Config<K>["responseType"];
      }

      return optionalConfig?.select ? optionalConfig.select(flattened) : (flattened as Config<K>["responseType"]);
    },
  }) as any;

  const isInitialLoading = Boolean(infiniteQuery.isPending ?? infiniteQuery.isLoading);

  const isInitialError = Boolean(infiniteQuery.isError && !infiniteQuery.data);

  const isInfiniteLoading = Boolean(infiniteQuery.isFetchingNextPage);

  const isInfiniteError = Boolean(
    infiniteQuery.isFetchNextPageError ?? (infiniteQuery.isError && Boolean(infiniteQuery.data))
  );

  const fetchNextPage = () => {
    if (!infiniteQuery.hasNextPage) {
      return Promise.resolve(infiniteQuery);
    }

    if (infiniteQuery.isFetchingNextPage) {
      return Promise.resolve(infiniteQuery);
    }

    return infiniteQuery.fetchNextPage();
  };

  return {
    ...infiniteQuery,

    data: infiniteQuery.data,

    fetchNextPage,

    hasNextPage: Boolean(infiniteQuery.hasNextPage),

    isInitialLoading,
    isInitialError,
    initialError: isInitialError ? infiniteQuery.error : null,

    isInfiniteLoading,
    isInfiniteError,
    infiniteError: isInfiniteError ? infiniteQuery.error : null,

    setData: (updater: InfiniteSetDataUpdater<K>) => {
      queryClient.setQueryData<InfiniteData<PaginatedApiResponse>>(infiniteQueryKey, oldData => {
        const currentFlatData = flattenInfiniteData(oldData);

        const nextData = isUpdaterFunction<K>(updater)
          ? updater(currentFlatData as Config<K>["responseType"])
          : updater;

        if (!nextData) return oldData;

        return {
          pages: [nextData as any],
          pageParams: [1],
        };
      });
    },
  };
}

export default useInfinite;

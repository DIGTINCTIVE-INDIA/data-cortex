// useApi/usePaginatedQuery.ts

import { useUrlParams } from "@/hooks/useUrlParams";
import { useQueryClient, useQuery as useTanstackQuery } from "@tanstack/react-query";
import type { EndpointKeys } from "../apis";
import UseApiUtil from "../configs/useapi.util";
import type { Config } from "../types";

const DEFAULT_PAGE_SIZE = 25;

type UsePaginatedQueryArgs<K extends EndpointKeys> = {
  queryKey: readonly unknown[];
  request: (page?: number, body?: any, pageSize?: number) => Promise<Config<K>["responseType"]>;
  options?: any;
  optionalConfig: any;
};

function usePaginated<K extends EndpointKeys>({
  queryKey,
  request,
  options,
  optionalConfig,
}: UsePaginatedQueryArgs<K>) {
  const queryClient = useQueryClient();

  const pageKey = options?.paginatedKeyName ?? "page";
  const sizeKey = options?.paginatedKeyName ? `${options.paginatedKeyName}_size` : "page_size";

  const { params, setParam, setParams } = useUrlParams({
    [pageKey]: "1",
    [sizeKey]: String(options?.query?.page_size ?? optionalConfig?.pageSize ?? DEFAULT_PAGE_SIZE),
  });

  const currentPage = Number(params[pageKey] ?? "1");

  const currentPageSize = Number(
    options?.query?.page_size ?? params[sizeKey] ?? optionalConfig?.pageSize ?? DEFAULT_PAGE_SIZE
  );

  const setPage = (value: number) => {
    setParam(pageKey, String(Math.max(1, value)));
  };

  const setPageSize = (value: number) => {
    setParams({
      [sizeKey]: String(value),
      [pageKey]: "1",
    });
  };

  const paginatedQuery = useTanstackQuery({
    queryKey: [...queryKey, params[pageKey], params[sizeKey]],
    queryFn: () => request(currentPage, undefined, currentPageSize),
    enabled: options?.enabled ?? true,
    staleTime: UseApiUtil.formatTimeInMs(optionalConfig?.staleTime),
    initialData: optionalConfig?.defaultValue,
    select: optionalConfig?.select ? (rawData: Config<K>["responseType"]) => optionalConfig.select(rawData) : undefined,
  }) as any;

  return {
    ...paginatedQuery,

    setData: (
      updater:
        | Config<K>["responseType"]
        | ((prev: Config<K>["responseType"] | undefined) => Config<K>["responseType"] | undefined)
    ) => {
      queryClient.setQueryData<Config<K>["responseType"]>(queryKey, updater);
    },

    currentPage,
    setPage,
    pageSize: currentPageSize,
    setPageSize,
  };
}

export default usePaginated;

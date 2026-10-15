// useApi/hooks/useApiQuery.ts

import { useQueryClient, useQuery as useTanstackQuery } from "@tanstack/react-query";
import type { EndpointKeys } from "../apis";
import retryApi from "../configs/retryapi";
import UseApiUtil from "../configs/useapi.util";
import type { Config } from "../types";

type UseApiQueryArgs<K extends EndpointKeys> = {
  queryKey: readonly [K, any, any, any];
  request: () => Promise<Config<K>["responseType"]>;
  enabled?: boolean;
  optionalConfig: any;
};

function useQuery<K extends EndpointKeys>({ queryKey, request, enabled = true, optionalConfig }: UseApiQueryArgs<K>) {
  const queryClient = useQueryClient();

  const query = useTanstackQuery({
    queryKey,
    queryFn: request,
    enabled,
    initialData: optionalConfig?.defaultValue,
    staleTime: UseApiUtil.formatTimeInMs(optionalConfig?.staleTime),
    select: optionalConfig?.select ? (rawData: Config<K>["responseType"]) => optionalConfig.select(rawData) : undefined,
    retry: (failureCount: number, error: any) => retryApi(failureCount, error, optionalConfig?.retry ?? 3),
    retryDelay: 500,
  });

  return {
    ...query,

    setData: (
      updater:
        | Config<K>["responseType"]
        | ((prev: Config<K>["responseType"] | undefined) => Config<K>["responseType"] | undefined)
    ) => {
      queryClient.setQueryData<Config<K>["responseType"]>(queryKey, updater);
    },
  };
}

export default useQuery;

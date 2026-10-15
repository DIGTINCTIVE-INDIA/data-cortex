// import { accessToken } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { EndpointKeys } from "../apis";
import { apiConfig } from "../apis";
import type { Config, ExtractBodyForOption, PathParams } from "../types";

export const useApiSetData = () => {
  const queryClient = useQueryClient();

  return useCallback(
    <K extends EndpointKeys>(
      keyInfo: {
        endpoint: K;
        params?: PathParams<K>;
        query?: Config<K> extends { query: infer Q extends Record<string, any> } ? Partial<Q> : never;
        body?: ExtractBodyForOption<K>;
      },
      updater:
        | Config<K>["responseType"]
        | ((prev: Config<K>["responseType"] | undefined) => Config<K>["responseType"] | undefined)
    ) => {
      const { endpoint, params, query: q, body } = keyInfo;
      const config = apiConfig[endpoint];

      if (config.type !== "query") {
        console.warn("setDataWithCacheKey is intended for query endpoints only.");
        return;
      }

      const queryKey = [endpoint, params, q, body] as const;

      queryClient.setQueryData<Config<K>["responseType"]>(queryKey, updater);
    },
    [queryClient]
  );
};

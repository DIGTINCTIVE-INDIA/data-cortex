import { useAuthStore } from "@/contexts/AuthContext";
import { useCallback, useRef } from "react";
import type { EndpointKeys } from "../apis";
import { apiConfig } from "../apis";
import { axiosClient } from "../configs/axios.client";
import type { UseApiOptions, UseApiReturn } from "../types";
import type { HTTP_METHOD } from "../types/common.types";
import useInfinite from "./useInfinite";
import useMutation from "./useMutation";
import usePaginated from "./usePaginated";
import useQuery from "./useQuery";

const DEFAULT_PAGE_SIZE = 25;
export function useApi<K extends EndpointKeys>(endpoint: K, options?: UseApiOptions<K>): UseApiReturn<K> {
  const { axios } = axiosClient;
  const config = apiConfig[endpoint];
  const optionalConfig = config as any;

  const [method, ...pathParts] = endpoint.split(" ") as [string, ...string[]];
  let basePath = pathParts.join(" ");

  const queryRef = useRef<Record<string, any>>({});
  const paramsRef = useRef<Record<string, any>>({});

  const buildUrl = useCallback(
    (page?: number, pageSize: number = DEFAULT_PAGE_SIZE, extraQuery: Record<string, any> = {}) => {
      let finalUrl = basePath;

      const mergedParams = {
        ...(options?.params ?? {}),
        ...(paramsRef.current ?? {}), // function-level override
      };

      Object.entries(mergedParams).forEach(([key, value]) => {
        if (value !== undefined) {
          finalUrl = finalUrl.replace(`:${key}`, String(value));
        }
      });

      const sp = new URLSearchParams();

      if (config.type === "paginated") {
        sp.set("page", String(page ?? 1));
        sp.set("limit", String(pageSize));
      }

      if (options?.query) {
        Object.entries(options.query).forEach(([k, v]) => {
          if (v === undefined) return;
          if (Array.isArray(v)) {
            v.forEach(val => val !== undefined && sp.append(k, String(val)));
          } else {
            sp.append(k, String(v));
          }
        });
      }

      if (extraQuery) {
        Object.entries(extraQuery).forEach(([k, v]) => {
          if (v === undefined) return;
          if (Array.isArray(v)) {
            v.forEach(val => val !== undefined && sp.append(k, String(val)));
          } else {
            sp.append(k, String(v));
          }
        });
      }

      const queryString = sp.toString();
      return queryString ? `${finalUrl}?${queryString}` : finalUrl;
    },
    [basePath, config.type, options?.params, options?.query]
  );

  const accessToken = useAuthStore(state => state.accessToken);

  const request = useCallback(
    async (page?: number, body?: any, pageSize?: number, extraQuery: Record<string, any> = {}) => {
      const finalBody = body ?? options?.body;
      const finalUrl = buildUrl(page, pageSize, extraQuery);
      const protectedHeaders = {
        Authorization: `Bearer ${accessToken}`,
      };

      const res = await axios({
        url: finalUrl,
        method: method as HTTP_METHOD,
        data: finalBody,
        headers: config.protected ? protectedHeaders : undefined,
      });

      if (res.data.type == "paginated") {
        const hasNextPage = res.data.data.pagination.currentPage < res.data.data.pagination.totalPages;
        return {
          success: res.data.success,
          data: {
            items: res.data.data.items,
            pagination: res.data.data.pagination,
            hasNextPage: hasNextPage,
          },
          clientCache: {
            nextPageUrl: hasNextPage
              ? window.location.origin + buildUrl(res.data.data.pagination.currentPage + 1, pageSize, extraQuery)
              : null,
            hasNextPage: hasNextPage,
            error: null,
            isInfiniteLoading: false,
          },
        } as typeof config.responseType;
      }

      return res.data as typeof config.responseType;
    },
    [buildUrl, method, options?.body]
  );

  const queryKey = [endpoint, options?.params, options?.query, options?.body] as const;

  switch (config.type) {
    case "query": {
      return useQuery({
        queryKey,
        request,
        enabled: options?.enabled ?? true,
        optionalConfig,
      }) as UseApiReturn<K>;
    }

    case "mutation": {
      return useMutation<K>({
        request,
        optionalConfig,
        options,
        axios,
        queryRef,
        paramsRef,
      });
    }

    case "paginated": {
      return usePaginated<K>({
        queryKey,
        request,
        options,
        optionalConfig,
      });
    }

    case "infinite": {
      return useInfinite<K>({
        endpoint,
        method,
        basePath,
        axios,
        accessToken,
        config,
        optionalConfig,
        options,
      }) as UseApiReturn<K>;
    }
    default:
      throw new Error("Invalid ApiConfig type.");
  }
}

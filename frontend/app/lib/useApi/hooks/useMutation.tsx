// useApi/useMutation.ts

import { useQueryClient, useMutation as useTanstackMutation } from "@tanstack/react-query";
import type { EndpointKeys } from "../apis";
import retryApi from "../configs/retryapi";
import type { ExtractBodyForOption, MutationCallOptions, UseApiReturn } from "../types";
import type { HTTP_METHOD } from "../types/common.types";

type UseApiMutationArgs<K extends EndpointKeys> = {
  request: (page?: number, body?: any, pageSize?: number, extraQuery?: Record<string, any>) => Promise<any>;
  optionalConfig: any;
  options?: any;
  axios: any;
  queryRef: React.RefObject<Record<string, any>>;
  paramsRef: React.RefObject<Record<string, any>>;
};

function useMutation<K extends EndpointKeys>({
  request,
  optionalConfig,
  options,
  axios,
  queryRef,
  paramsRef,
}: UseApiMutationArgs<K>): UseApiReturn<K> {
  const queryClient = useQueryClient();

  const baseMutation = useTanstackMutation({
    mutationFn: (body?: ExtractBodyForOption<K>) => {
      return request(undefined, body, undefined, queryRef.current);
    },

    retry: (failureCount: number, error: any) => retryApi(failureCount, error, optionalConfig?.retry ?? 3),

    retryDelay: 500,

    onSuccess: () => {
      optionalConfig?.revalidateOnSuccess?.forEach((key: any) =>
        queryClient.refetchQueries({
          queryKey: [key],
          exact: false,
        })
      );

      optionalConfig?.triggerOnSuccess?.forEach((triggerEndpoint: string) => {
        const [triggerMethod, triggerPath] = triggerEndpoint.split(" ") as [string, string];

        let finalUrl = triggerPath;

        if (options?.context) {
          const paramRegex = /:(\w+)/g;
          let match;

          while ((match = paramRegex.exec(triggerPath)) !== null) {
            const paramName = match[1];
            const value = options.context[paramName];

            if (value !== undefined) {
              finalUrl = finalUrl.replace(`:${paramName}`, String(value));
            } else {
              console.warn(`[useApi] Missing context param ":${paramName}" for trigger "${triggerEndpoint}"`);
            }
          }
        }

        axios({
          url: finalUrl,
          method: triggerMethod as HTTP_METHOD,
        }).catch((err: any) => {
          console.warn(`[useApi] Auto-trigger failed for ${triggerEndpoint}:`, err.message);
        });
      });
    },
  });

  return {
    ...baseMutation,

    mutate: (body?: ExtractBodyForOption<K>, options?: MutationCallOptions<K>) => {
      queryRef.current = options?.query ?? {};
      paramsRef.current = options?.params ?? {};
      return baseMutation.mutate(body, options);
    },

    mutateAsync: (body?: ExtractBodyForOption<K>, options?: MutationCallOptions<K>) => {
      queryRef.current = options?.query ?? {};
      paramsRef.current = options?.params ?? {};
      return baseMutation.mutateAsync(body, options);
    },
  } as UseApiReturn<K>;
}

export default useMutation;

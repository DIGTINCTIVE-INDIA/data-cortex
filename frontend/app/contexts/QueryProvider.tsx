/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { toast } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError(error: any) {
        // console.log(error.response.data);
        toast.error(error.response?.data?.message ?? error.message);
      },
      onSuccess(data: any) {
        console.log(data);
        // toast(data?.message);
      },
    },
  },
});

const QueryProvider = ({ children }: { children: ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

export default QueryProvider;

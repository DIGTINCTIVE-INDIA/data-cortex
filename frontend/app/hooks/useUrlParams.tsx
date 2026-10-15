import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";

type StringRecord = Record<string, string>;

export type UseUrlParamsReturn<T extends StringRecord> = {
  params: T;
  setParam: <K extends keyof T>(key: K, value: T[K]) => void;
  setParams: (values: Partial<T>) => void;
};

export function useUrlParams<T extends StringRecord>(
  defaults: T
): UseUrlParamsReturn<T> {
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- derive values ----
  const params = useMemo(() => {
    const result = {} as T;

    (Object.keys(defaults) as Array<keyof T>).forEach((key) => {
      const raw = searchParams.get(key as string);
      result[key] = (raw ?? defaults[key]) as T[keyof T];
    });

    return result;
  }, [searchParams, defaults]);

  // ---- ensure non-empty defaults exist in URL ----
  useEffect(() => {
    let changed = false;
    const newParams = new URLSearchParams(searchParams);

    (Object.entries(defaults) as [keyof T, string][]).forEach(
      ([key, defaultValue]) => {
        // ⛔ skip empty defaults
        if (defaultValue === "") return;

        if (!newParams.has(key as string)) {
          newParams.set(key as string, defaultValue);
          changed = true;
        }
      }
    );

    if (changed) {
      setSearchParams(newParams, { replace: true });
    }
  }, [defaults, searchParams, setSearchParams]);

  // ---- set single param ----
  const setParam = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      const newParams = new URLSearchParams(searchParams);

      if (value === "") {
        newParams.delete(key as string); // ✅ remove instead of key=
      } else {
        newParams.set(key as string, value);
      }

      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  // ---- bulk update ----
  const setParams = useCallback(
    (values: Partial<T>) => {
      const newParams = new URLSearchParams(searchParams);

      (Object.entries(values) as [keyof T, string][]).forEach(([k, v]) => {
        if (v === "") {
          newParams.delete(k as string); // ✅ remove empty
        } else {
          newParams.set(k as string, v);
        }
      });

      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  return { params, setParam, setParams };
}

export function useUrlParamsValue<T extends StringRecord>(defaults: T): T {
  const [searchParams] = useSearchParams();

  const params = useMemo(() => {
    const result = {} as T;

    (Object.keys(defaults) as Array<keyof T>).forEach((key) => {
      const raw = searchParams.get(key as string);
      result[key] = (raw ?? defaults[key]) as T[keyof T];
    });

    return result;
  }, [searchParams, defaults]);

  return params;
}

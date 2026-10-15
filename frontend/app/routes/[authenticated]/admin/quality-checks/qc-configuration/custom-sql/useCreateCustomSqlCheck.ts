import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { useApi } from "@/lib/useApi";
import type { LibraryItems } from "@/lib/useApi/types/librariesApis.types";
import type { CreateCustomSqlCheckMutationBody } from "@/lib/useApi/types/qcConfigurationApis.types";
import { toast } from "sonner";
import { customSqlCheckDefaultValues, type CustomSqlCheckFormValues } from "./customSqlCheck.schema";

const criticalityOptions = [
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
];

const useCreateCustomSqlCheck = () => {
  const [selectedDownstreams, setSelectedDownstreams] = useState<number[]>([]);
  const { mutateAsync, isPending } = useApi("POST /api/qc-configuration/custom-sql/create-check");
  const { mutateAsync: validateQuery, isPending: isValidating } = useApi(
    "POST /api/qc-configuration/custom-sql/validate-query"
  );

  const form = useForm<CustomSqlCheckFormValues>({
    mode: "onChange",
    defaultValues: customSqlCheckDefaultValues,
  });

  const { watch, setValue, handleSubmit, reset } = form;

  const selectedSourceConnectionId = watch("sourceConnectionId");

  const libraries = useApi("GET /api/libraries/qc-tags/all");
  const dbConnections = useApi("GET /api/db/connections/list?page=1&limit=500");

  const libraryItems = libraries.data?.data;

  const workstreams = libraryItems?.workstream ?? [];
  const categories = libraryItems?.category ?? [];
  const dataSources = libraryItems?.dataSource ?? [];
  const downstreams = libraryItems?.impactedDownstream ?? [];
  const activeConnections = useMemo(
    () => (dbConnections.data?.data?.items ?? []).filter(connection => connection.enabled),
    [dbConnections.data]
  );

  const selectedDB = useMemo(() => {
    return activeConnections.find(connection => String(connection.connectionId) === String(selectedSourceConnectionId));
  }, [activeConnections, selectedSourceConnectionId]);

  const toggleDownstream = (item: LibraryItems) => {
    const downstreamId = item.id;

    const nextValues = selectedDownstreams.includes(downstreamId)
      ? selectedDownstreams.filter(id => id !== downstreamId)
      : [...selectedDownstreams, downstreamId];

    setSelectedDownstreams(nextValues);

    setValue("impactedDownstreamId", nextValues);
  };

  const onSubmit = handleSubmit(
    async data => {
      const payload: CreateCustomSqlCheckMutationBody = {
        ...data,
        impactedDownstreamIds: selectedDownstreams,
      };

      try {
        await mutateAsync(payload);

        toast.success(`Check "${data.checkName}" created`);

        // Only clear on success -- blanking the form after a failure loses the user's
        // input and makes a rejected save look like it worked.
        reset({ ...customSqlCheckDefaultValues });
        setSelectedDownstreams([]);
      } catch (error) {
        const message =
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (error as { message?: string })?.message ??
          "Unknown error";

        toast.error("Could not create check", { description: message, duration: 10000 });
      }
    },
    errors => {
      console.log("CUSTOM SQL CHECK VALIDATION ERRORS =>", errors);
    }
  );

  const onValidateQuery = async () => {
    const sqlQuery = watch("sqlQuery") || "";
    await validateQuery(
      { sqlQuery, sourceConnectionId: selectedSourceConnectionId },
      {
        onSuccess: () => {
          toast("Query is valid !");
        },
      }
    );
  };

  return {
    form,
    onSubmit,

    selectedSourceConnectionId,
    selectedDB,

    workstreams,
    categories,
    dataSources,
    downstreams,
    activeConnections,
    criticalityOptions,

    selectedDownstreams,
    toggleDownstream,

    isLibrariesPending: libraries.isPending,
    isConnectionsPending: dbConnections.isPending,
    isSaving: isPending,

    isValidating,
    onValidateQuery,
  };
};

export default useCreateCustomSqlCheck;

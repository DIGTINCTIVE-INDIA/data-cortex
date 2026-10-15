import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useNavigationType, useSearchParams } from "react-router";
import { toast } from "sonner";

import { useApi } from "@/lib/useApi";
import type { LibraryItems } from "@/lib/useApi/types/librariesApis.types";
import { clearDraft, readDraft, readLastDraft, saveDraft } from "../../components/flowDraft";
import { databaseCheckDefaultValues, type DatabaseCheckFormValues } from "./databaseCheck.schema";

export const DB_FLOW = "db";

const useCreateDBCheck = () => {
  const navigate = useNavigate();
  const form = useForm<DatabaseCheckFormValues>({
    mode: "onChange",
    defaultValues: databaseCheckDefaultValues,
  });

  const {
    watch,
    setValue,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = form;

  const sourceDbId = watch("sourceDbId");
  const createLanding = watch("createLanding");
  const selectedDownstreams = watch("impactedDownstreamIds") ?? [];

  const createCheck = useApi("POST /api/qc-configuration/db/create-check");
  const updateCheck = useApi("PATCH /api/qc-configuration/db/update-check");

  // Coming back from step 2 means "edit the check I just made", not "start a new one".
  // The id arrives in the URL when Back was clicked in the app, and from the last saved
  // draft when the browser's own Back button brought us here (that URL has no id).
  const [searchParams] = useSearchParams();
  const navigationType = useNavigationType();
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = searchParams.get("configId");
    const draft = fromUrl
      ? readDraft<DatabaseCheckFormValues>(DB_FLOW, fromUrl)
      : navigationType === "POP"
        ? readLastDraft<DatabaseCheckFormValues>(DB_FLOW)
        : null;

    if (!draft) return;

    reset(draft.values);
    setEditingId(draft.id);
    // Run once on arrival; later edits must not be overwritten by a re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const libraries = useApi("GET /api/libraries/qc-tags/all");
  const dbConnections = useApi("GET /api/db/connections/list?page=1&limit=500");

  const tables = useApi("GET /api/db/connections/tables", {
    query: { connectionId: sourceDbId },
    enabled: !!sourceDbId,
  });

  const workstreams = libraries.data?.data?.workstream ?? [];
  const categories = libraries.data?.data?.category ?? [];
  const dataSources = libraries.data?.data?.dataSource ?? [];
  const downstreams = libraries.data?.data?.impactedDownstream ?? [];

  const activeConnections = dbConnections.data?.data?.items?.filter(connection => connection.enabled) ?? [];

  const sourceTables = tables.data?.data?.tables ?? [];

  const selectedDB = useMemo(() => {
    return activeConnections.find((db: any) => String(db.connectionId) === String(sourceDbId));
  }, [activeConnections, sourceDbId]);

  const toggleDownstream = (item: LibraryItems) => {
    const exists = selectedDownstreams.includes(item.id);

    const nextValue = exists ? selectedDownstreams.filter(id => id !== item.id) : [...selectedDownstreams, item.id];

    setValue("impactedDownstreamIds", nextValue, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleSourceDbChange = (connectionId: string) => {
    setValue("sourceDbId", connectionId, {
      shouldDirty: true,
      shouldValidate: true,
    });

    setValue("sourceTableName", "", {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const onSubmit = handleSubmit(async values => {
    try {
      let configId: string | undefined;

      if (editingId) {
        await updateCheck.mutateAsync(values, { query: { configId: editingId } });
        configId = editingId;
        toast.success(`Check "${values.checkName}" updated`);
      } else {
        const response = (await createCheck.mutateAsync(values)) as
          | { data?: { config?: { configId?: string } } }
          | undefined;

        configId = response?.data?.config?.configId;
        toast.success(`Check "${values.checkName}" created`);
      }

      // Kept so Back from step 2 returns to this exact form, filled in.
      if (configId) saveDraft(DB_FLOW, configId, values);

      // Only clear on success -- blanking the form after a failure loses the user's
      // input and makes a rejected save look like it worked.
      reset({ ...databaseCheckDefaultValues });
      setEditingId(null);

      if (configId) {
        // The check exists but has no field rules yet, so carry straight on to step 2.
        // The id travels in the URL rather than in state so a refresh stays on the
        // right check instead of losing the configuration.
        navigate(
          `/admin/quality-checks/qc-configuration/data-conformance/db/column-mapping` +
            `?configId=${encodeURIComponent(configId)}&checkName=${encodeURIComponent(values.checkName)}` +
            // Lets step 2 offer "fetch from source" without a second lookup of the check.
            `&connectionId=${encodeURIComponent(values.sourceDbId)}&tableName=${encodeURIComponent(values.sourceTableName)}`
        );
      } else {
        toast.warning("Check created, but no id came back", {
          description: "Open it from Configured Checks to set its field rules.",
        });
      }
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (error as { message?: string })?.message ??
        "Unknown error";

      toast.error(editingId ? "Could not update check" : "Could not create check", { description: message, duration: 10000 });
    }
  });

  return {
    form,
    onSubmit,

    createLanding,
    sourceDbId,
    selectedDB,

    workstreams,
    categories,
    dataSources,
    downstreams,
    activeConnections,
    sourceTables,

    selectedDownstreams,
    toggleDownstream,
    handleSourceDbChange,

    isLibrariesPending: libraries.isPending,
    isTablesListLoading: tables.isPending,
    isSaving: isSubmitting || createCheck.isPending || updateCheck.isPending,
    editingId,
  };
};

export default useCreateDBCheck;

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { FieldRulesTable, buildDefaultRule, splitRiTable, type FieldRule } from "@/components/ui/custom/FieldRulesTable";
import { SchemaFileDrop } from "@/components/ui/custom/SchemaFileDrop";
import { clearCache, readCache, writeCache } from "@/lib/localCache";
import { schemaFromNativeColumns } from "@/lib/schemaFile/nativeTypes";
import { useApi } from "@/lib/useApi";
import type { ParsedSchemaRow } from "@/lib/schemaFile/parseSchemaFile";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { FlowSteps } from "../../../components/FlowSteps";
import { FieldRulesPlaceholder } from "../../../components/FieldRulesPlaceholder";
import { SchemaSourceChooser } from "../../../components/SchemaSourceChooser";
import { clearDraft } from "../../../components/flowDraft";
import { DB_FLOW } from "../useCreateDBCheck";
import { HugeiconsIcon } from "@hugeicons/react";

const DB_CONFIG_LIST = "/admin/quality-checks/configured-quality-checks";
const DB_STEP_ONE = "/admin/quality-checks/qc-configuration/data-conformance/db";

/**
 * Step 2 of creating a db-based check: the per-column rules.
 *
 * The check row already exists by the time we get here -- step 1 created it and passed
 * its id in the query string. Keeping the id in the URL rather than in a provider means
 * a refresh lands back on the same check instead of losing the configuration.
 */
export default function DbColumnMappingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const configId = searchParams.get("configId") ?? "";
  const checkName = searchParams.get("checkName") ?? "";
  const connectionId = searchParams.get("connectionId") ?? "";
  const tableName = searchParams.get("tableName") ?? "";

  // The table is kept in this browser as it is edited (order, ticks, values), so a refresh or a
  // closed tab does not lose it. Cleared once the rules are saved.
  const cacheKey = `rules:db:${configId}`;
  const [rules, setRules] = useState<FieldRule[]>(
    () =>
      (configId &&
        readCache<FieldRule[]>(
          cacheKey,
          value => Array.isArray(value) && value.length > 0 && value.every(rule => typeof (rule as FieldRule)?.field === "string")
        )) ||
      []
  );
  const [fileName, setFileName] = useState<string | null>(() => (rules.length ? "restored from this browser" : null));

  useEffect(() => {
    if (configId && rules.length) writeCache(cacheKey, rules);
  }, [cacheKey, configId, rules]);

  const { mutateAsync: setColumns, isPending } = useApi("POST /api/qc-configuration/db/set-columns");

  // Reads the source table's CURRENT columns. Held until the button is pressed: a fetch on
  // page load would overwrite nothing today but would hit the source on every visit.
  const columnsQuery = useApi("GET /api/db/connections/columns", {
    enabled: false,
    query: { connectionId, tableName },
  });

  const canFetch = Boolean(connectionId && tableName);

  const handleFetch = async () => {
    const result = await columnsQuery.refetch();
    const columns = result.data?.data?.columns;

    if (!columns?.length) {
      toast.error("Could not read the source table", {
        description: "Check that the connection is reachable, or upload a schema file instead.",
      });
      return;
    }

    const { rows, warnings } = schemaFromNativeColumns(columns);

    handleParsed(rows, `${tableName} (from source)`);

    toast.success(`Read ${rows.length} columns from ${tableName}`, {
      description: warnings.length ? warnings.slice(0, 3).join(" ") : undefined,
    });
  };

  const handleParsed = (rows: ParsedSchemaRow[], uploadedName: string) => {
    setFileName(uploadedName);
    setRules(rows.map(row => buildDefaultRule(row.field, row.dataType, row.columnOrder)));
  };

  const handleSave = async () => {
    if (!rules.length) {
      toast.error("Upload a schema file first");
      return;
    }

    // Mirrors what the backend requires: a criticality whenever the check is enabled, and its
    // value where one is needed. Catching it here names the column AND the check, which a 422
    // from the server would not.
    const missingFor = (rule: FieldRule): string | null => {
      if (rule.primaryKeyCheck && !rule.primaryKeyCheckCriticality) return "Primary Key needs a criticality";
      if (rule.nullCheck && !rule.nullCheckCriticality) return "Null needs a criticality";
      if (rule.duplicateCheck && !rule.duplicateCheckCriticality) return "Duplicate needs a criticality";
      if (rule.lengthCheck && !rule.minLength) return "Length is ticked but has no minimum";
      if (rule.lengthCheck && !rule.maxLength) return "Length is ticked but has no maximum (use the same number for an exact length)";
      if (rule.lengthCheck && rule.maxLength && rule.minLength && rule.maxLength < rule.minLength) return "Length maximum is below the minimum";
      if (rule.lengthCheck && !rule.lengthCheckCriticality) return "Length needs a criticality";
      if (rule.formatCheck && !rule.formatRegex) return "Format is ticked but has no regex";
      if (rule.formatCheck && !rule.formatCheckCriticality) return "Format needs a criticality";
      if (rule.lovCheck && !rule.lovs) return "List of Values is ticked but has no values";
      if (rule.lovCheck && !rule.lovCheckCriticality) return "List of Values needs a criticality";
      if (rule.riCheck && !splitRiTable(rule.riReferenceTable).table.trim()) return "Referential Integrity is ticked but has no table";
      if (rule.riCheck && !rule.riFieldName) return "Referential Integrity is ticked but has no field";
      if (rule.riCheck && !rule.riCheckCriticality) return "Referential Integrity needs a criticality";
      return null;
    };

    for (const rule of rules) {
      const problem = missingFor(rule);
      if (problem) {
        toast.error(`"${rule.field}": ${problem}`, { description: "Fix it, or untick the check, then save again." });
        return;
      }
    }

    // A list of columns with nothing ticked saves fine but can never run: the engine finds no check
    // to execute. Say so here, before it becomes a failed run.
    const anyCheck = rules.some(
      rule => rule.primaryKeyCheck || rule.nullCheck || rule.duplicateCheck || rule.lengthCheck || rule.formatCheck || rule.lovCheck || rule.riCheck
    );

    if (!anyCheck) {
      toast.error("No checks are ticked", {
        description: "Tick at least one check on at least one column. With none ticked there is nothing to run.",
      });
      return;
    }

    // A db check's reference table is read through the same connection as its source table,
    // so the connection is filled in here; the backend refuses a referential check without one.
    if (!connectionId && rules.some(rule => rule.riCheck)) {
      toast.error("Cannot save referential checks", { description: "This check has no source connection recorded." });
      return;
    }

    const columns = rules.map(rule => (rule.riCheck ? { ...rule, riConnectionId: rule.riConnectionId || connectionId } : rule));

    try {
      await setColumns({ configId, columns });

      toast.success(`Field rules saved for ${configId}`, {
        description: `${rules.length} column${rules.length === 1 ? "" : "s"} configured.`,
      });

      // Finished: the draft has done its job, and a completed check should not be
      // offered back as something to edit in this flow.
      clearDraft(DB_FLOW, configId);
      clearCache(cacheKey);

      navigate(DB_CONFIG_LIST);
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (error as { message?: string })?.message ??
        "Unknown error";

      toast.error("Could not save field rules", { description: message, duration: 10000 });
    }
  };

  if (!configId) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-xl font-semibold">Field Configuration</h1>
        <p className="text-sm text-muted-foreground">
          No check was selected. Open this page from a database check so its field rules can be saved against it.
        </p>
        <Button onClick={() => navigate(DB_CONFIG_LIST)}>Back to configured checks</Button>
      </div>
    );
  }

  const stepOne = `${DB_STEP_ONE}?configId=${encodeURIComponent(configId)}`;

  return (
    <div className="space-y-5 p-6">
      <FlowSteps steps={[{ label: "Configuration", to: stepOne }, { label: "Field rules" }]} current={1} />

      <div>
        <h1 className="text-xl font-semibold text-foreground">Field rules</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {checkName ? `${checkName} · ` : ""}
          {configId}
        </p>
      </div>

      <SchemaSourceChooser
        onFetch={handleFetch}
        isFetching={columnsQuery.isFetching}
        canFetch={canFetch}
        fetchBlockedReason="This check has no source table recorded to read from."
        loadedColumns={rules.length}
        sourceLabel={tableName || undefined}
        uploadPanel={
          <SchemaFileDrop
            onParsed={handleParsed}
            loadedFileName={fileName}
            loadedRowCount={rules.length}
            disabled={isPending}
            compact
          />
        }
      />

      {rules.length > 0 ? (
        <FieldRulesTable rules={rules} onChange={setRules} disabled={isPending} />
      ) : (
        <FieldRulesPlaceholder />
      )}

      {/* Save lives at the bottom, where the work ends, and stays in view while a long table
          scrolls. Back is beside it so the way out of this step is always the same place. */}
      <div className="sticky bottom-0 -mx-6 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
        <Button variant="outline" className="rounded-xl" onClick={() => navigate(stepOne)}>
          <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
          Back
        </Button>

        <Button onClick={handleSave} isLoading={isPending} disabled={!rules.length} className="rounded-xl">
          Save field rules
        </Button>
      </div>
    </div>
  );
}

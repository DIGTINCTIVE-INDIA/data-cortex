import { Badge } from "@/components/ui/badge";
import type { FieldRule } from "@/components/ui/custom/FieldRulesTable";
import { useApi } from "@/lib/useApi";

type Props = {
  kind: "db" | "file";
  configId: string;
};

const CRITICALITY_LABEL: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };

const lengthText = (rule: FieldRule) => {
  const min = rule.minLength;
  const max = rule.maxLength;

  if (min != null && max != null && min !== max) return `Length ${min}–${max}`;
  return `Length ${min ?? max ?? ""}`.trim();
};

/** Only the checks that are switched on, each with its own detail and criticality. */
const ruleChips = (rule: FieldRule) => {
  const chips: { label: string; criticality?: string | null }[] = [];

  if (rule.primaryKeyCheck) chips.push({ label: "Primary key", criticality: rule.primaryKeyCheckCriticality });
  if (rule.nullCheck) chips.push({ label: "Not null", criticality: rule.nullCheckCriticality });
  if (rule.duplicateCheck) chips.push({ label: "No duplicates", criticality: rule.duplicateCheckCriticality });
  if (rule.lengthCheck) chips.push({ label: lengthText(rule), criticality: rule.lengthCheckCriticality });
  if (rule.formatCheck) chips.push({ label: `Format ${rule.formatRegex ?? ""}`.trim(), criticality: rule.formatCheckCriticality });
  if (rule.lovCheck) chips.push({ label: `Allowed values: ${rule.lovs ?? ""}`.trim(), criticality: rule.lovCheckCriticality });
  if (rule.riCheck) {
    chips.push({
      label: `Exists in ${[rule.riReferenceTable, rule.riFieldName].filter(Boolean).join(".")}`,
      criticality: rule.riCheckCriticality,
    });
  }

  return chips;
};

const FieldDetails = ({ kind, configId }: Props) => {
  const dbColumns = useApi("GET /api/qc-configuration/db/list-columns", {
    query: { configId },
    enabled: kind === "db",
  });
  const fileColumns = useApi("GET /api/qc-configuration/file-storage/list-columns", {
    query: { configId },
    enabled: kind === "file",
  });

  const { data, isLoading, isError } = kind === "db" ? dbColumns : fileColumns;
  const rules: FieldRule[] = data?.data?.columns ?? [];

  return (
    <div className="rounded-2xl border bg-card p-6">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Field Details</h3>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading fields…</p>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">The field details could not be loaded.</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fields have been configured for this check.</p>
      ) : (
        <div className="divide-y">
          {rules.map(rule => {
            const chips = ruleChips(rule);

            return (
              <div key={rule.field} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-start md:gap-6">
                <div className="flex shrink-0 items-center gap-2 md:w-56">
                  <span className="break-all text-sm font-medium text-foreground">{rule.field}</span>
                  <Badge variant="outline">{rule.dataType}</Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  {chips.length === 0 ? (
                    <span className="text-sm text-muted-foreground">No checks</span>
                  ) : (
                    chips.map(chip => (
                      <Badge key={chip.label} variant="secondary" className="h-auto whitespace-normal rounded-xl px-3 py-1">
                        {chip.label}
                        {chip.criticality ? ` · ${CRITICALITY_LABEL[chip.criticality] ?? chip.criticality}` : ""}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FieldDetails;

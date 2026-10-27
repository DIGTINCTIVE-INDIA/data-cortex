import { Checkbox } from "@/components/ui/checkbox";
import { DragGhost, DragHandle } from "@/components/ui/custom/DragHandle";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRowReorder } from "@/lib/reorder";
import type { TraditionalDataType } from "@/lib/schemaFile/parseSchemaFile";
import { cn } from "@/lib/utils";

export type FieldRule = {
  field: string;
  dataType: TraditionalDataType;
  columnOrder: number;

  primaryKeyCheck: boolean;
  primaryKeyCheckCriticality?: string | null;

  nullCheck: boolean;
  nullCheckCriticality?: string | null;

  duplicateCheck: boolean;
  duplicateCheckCriticality?: string | null;

  lengthCheck: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  lengthCheckCriticality?: string | null;

  formatCheck: boolean;
  formatRegex?: string | null;
  formatCheckCriticality?: string | null;

  lovCheck: boolean;
  lovs?: string | null;
  lovCheckCriticality?: string | null;

  riCheck: boolean;
  riConnectionId?: string | null;
  riReferenceTable?: string | null;
  riFieldName?: string | null;
  riCheckCriticality?: string | null;
};

const CRITICALITY_OPTIONS = [
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
] as const;

const DATA_TYPE_OPTIONS: { label: string; value: TraditionalDataType }[] = [
  { label: "String", value: "string" },
  { label: "Varchar", value: "varchar" },
  { label: "Integer", value: "integer" },
  { label: "Float", value: "float" },
  { label: "Date", value: "date" },
  { label: "Datetime", value: "datetime" },
  { label: "Boolean", value: "boolean" },
];

/** The simple on/off checks; the ones with extra inputs are rendered individually. */
const SIMPLE_CHECKS = [
  { key: "primaryKeyCheck", criticalityKey: "primaryKeyCheckCriticality", label: "Primary Key" },
  { key: "nullCheck", criticalityKey: "nullCheckCriticality", label: "Null" },
  { key: "duplicateCheck", criticalityKey: "duplicateCheckCriticality", label: "Duplicate" },
] as const;

/**
 * The reference schema and table are stored together as "schema.table" in riReferenceTable
 * (there is no separate schema column), and the engine reads the schema from that prefix.
 * With no schema the value is just the table, and the connection's own schema is used.
 */
export function splitRiTable(value?: string | null): { schema: string; table: string } {
  const text = value ?? "";
  const dot = text.indexOf(".");

  return dot < 0 ? { schema: "", table: text } : { schema: text.slice(0, dot), table: text.slice(dot + 1) };
}

export function joinRiTable(schema: string, table: string): string | null {
  const s = schema.trim();

  if (!s) return table || null;

  return `${s}.${table}`;
}

export function buildDefaultRule(field: string, dataType: TraditionalDataType, columnOrder: number): FieldRule {
  return {
    field,
    dataType,
    columnOrder,
    primaryKeyCheck: false,
    nullCheck: false,
    duplicateCheck: false,
    lengthCheck: false,
    formatCheck: false,
    lovCheck: false,
    riCheck: false,
  };
}

type Props = {
  rules: FieldRule[];
  onChange: (next: FieldRule[]) => void;
  disabled?: boolean;
};

/**
 * Per-column rules for a traditional check.
 *
 * Purely presentational: it owns no data and performs no fetching, so the db-based and
 * file-based flows can both render it from whatever state they already hold.
 */
export function FieldRulesTable({ rules, onChange, disabled }: Props) {
  // Column order is what the order check compares against, so it is editable: drag a row,
  // or use the arrows. Numbers are always rewritten 1..n from the visible order, so they
  // can never skip or repeat.
  const reorder = useRowReorder(
    rules,
    next => onChange(next.map((rule, position) => ({ ...rule, columnOrder: position + 1 }))),
    rule => rule.field
  );

  const update = (index: number, patch: Partial<FieldRule>) => {
    onChange(rules.map((rule, position) => (position === index ? { ...rule, ...patch } : rule)));
  };

  /**
   * Turning a check off clears whatever it needed. The backend requires those values
   * whenever the flag is true, and leaving stale ones behind would save settings the
   * operator thinks they removed.
   */
  const toggle = (index: number, key: keyof FieldRule, extraKeysToClear: (keyof FieldRule)[], value: boolean) => {
    const patch: Partial<FieldRule> = { [key]: value } as Partial<FieldRule>;

    if (!value) {
      for (const extra of extraKeysToClear) {
        (patch as Record<string, unknown>)[extra] = null;
      }
    } else {
      // Switching a check on starts it at "medium" instead of leaving the select empty --
      // the backend refuses an enabled check with no criticality, so every check used to
      // need a second click just to be saveable. Only fills an empty one: re-enabling
      // never overwrites a level someone already chose.
      for (const extra of extraKeysToClear) {
        if (String(extra).endsWith("Criticality") && !rules[index]?.[extra]) {
          (patch as Record<string, unknown>)[extra] = "medium";
        }
      }
    }

    update(index, patch);
  };

  const criticalitySelect = (rule: FieldRule, index: number, key: keyof FieldRule, enabled: boolean) => (
    <Select
      value={(rule[key] as string) || undefined}
      onValueChange={value => update(index, { [key]: value } as Partial<FieldRule>)}
      disabled={disabled || !enabled}>
      <SelectTrigger className="h-8 w-28">
        <SelectValue placeholder="Criticality">
          {CRITICALITY_OPTIONS.find(option => option.value === rule[key])?.label ?? ""}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CRITICALITY_OPTIONS.map(option => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-44">Order</TableHead>
            <TableHead className="min-w-[180px]">Column</TableHead>
            <TableHead className="min-w-[140px]">Data Type</TableHead>
            {SIMPLE_CHECKS.map(check => (
              <TableHead key={check.key} className="min-w-[160px]">
                {check.label}
              </TableHead>
            ))}
            <TableHead className="min-w-[320px]">Length (min to max)</TableHead>
            <TableHead className="min-w-[260px]">Format</TableHead>
            <TableHead className="min-w-[260px]">List of Values</TableHead>
            <TableHead className="min-w-[440px]">Referential Integrity</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rules.map((rule, index) => (
            <TableRow
              // Keyed by field, not field + order: the order changes on every move, and a key
              // that changes remounts the row and drops focus mid-edit.
              key={rule.field}
              {...(disabled ? {} : reorder.rowProps(index))}
              className={reorder.rowClass(index)}>
              <TableCell className="text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  {disabled ? null : <DragHandle {...reorder.handleProps(index, rule.field)} title="Drag to reorder" />}
                  <span
                    className={cn(
                      "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-sm font-semibold tabular-nums transition-colors duration-500",
                      reorder.moved === index ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    )}>
                    {rule.columnOrder}
                  </span>
                  <button
                    type="button"
                    aria-label={`Move ${rule.field} up`}
                    title="Move up"
                    disabled={disabled || index === 0}
                    onClick={() => reorder.move(index, index - 1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-sm transition hover:border-primary hover:bg-primary hover:text-primary-foreground active:scale-90 disabled:pointer-events-none disabled:opacity-30">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 8l4-4 4 4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${rule.field} down`}
                    title="Move down"
                    disabled={disabled || index === rules.length - 1}
                    onClick={() => reorder.move(index, index + 1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-sm transition hover:border-primary hover:bg-primary hover:text-primary-foreground active:scale-90 disabled:pointer-events-none disabled:opacity-30">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 4l4 4 4-4" />
                    </svg>
                  </button>
                </div>
              </TableCell>

              <TableCell className="font-medium">{rule.field}</TableCell>

              <TableCell>
                <Select
                  value={rule.dataType}
                  onValueChange={value => update(index, { dataType: value as TraditionalDataType })}
                  disabled={disabled}>
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue>{DATA_TYPE_OPTIONS.find(o => o.value === rule.dataType)?.label ?? ""}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_TYPE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>

              {SIMPLE_CHECKS.map(check => (
                <TableCell key={check.key}>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={rule[check.key] as boolean}
                      disabled={disabled}
                      onCheckedChange={value => toggle(index, check.key, [check.criticalityKey], Boolean(value))}
                    />
                    {criticalitySelect(rule, index, check.criticalityKey, rule[check.key] as boolean)}
                  </div>
                </TableCell>
              ))}

              <TableCell>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={rule.lengthCheck}
                    disabled={disabled}
                    onCheckedChange={value =>
                      toggle(index, "lengthCheck", ["minLength", "maxLength", "lengthCheckCriticality"], Boolean(value))
                    }
                  />
                  {/* A length is always a range, both ends included. For an exact length, type the
                      same number in both. */}
                  <Input
                    type="number"
                    min={1}
                    className="h-8 w-20"
                    placeholder="Min"
                    aria-label={`${rule.field} minimum length`}
                    value={rule.minLength ?? ""}
                    disabled={disabled || !rule.lengthCheck}
                    onChange={event =>
                      update(index, { minLength: event.target.value ? Number(event.target.value) : null })
                    }
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="number"
                    min={1}
                    className="h-8 w-20"
                    placeholder="Max"
                    aria-label={`${rule.field} maximum length`}
                    value={rule.maxLength ?? ""}
                    disabled={disabled || !rule.lengthCheck}
                    onChange={event => update(index, { maxLength: event.target.value ? Number(event.target.value) : null })}
                  />
                  {criticalitySelect(rule, index, "lengthCheckCriticality", rule.lengthCheck)}
                </div>
              </TableCell>

              <TableCell>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={rule.formatCheck}
                    disabled={disabled}
                    onCheckedChange={value =>
                      toggle(index, "formatCheck", ["formatRegex", "formatCheckCriticality"], Boolean(value))
                    }
                  />
                  <Input
                    className="h-8 w-32"
                    placeholder="Regex"
                    value={rule.formatRegex ?? ""}
                    disabled={disabled || !rule.formatCheck}
                    onChange={event => update(index, { formatRegex: event.target.value || null })}
                  />
                  {criticalitySelect(rule, index, "formatCheckCriticality", rule.formatCheck)}
                </div>
              </TableCell>

              <TableCell>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={rule.lovCheck}
                    disabled={disabled}
                    onCheckedChange={value => toggle(index, "lovCheck", ["lovs", "lovCheckCriticality"], Boolean(value))}
                  />
                  <Input
                    className="h-8 w-32"
                    placeholder="A, B, C"
                    value={rule.lovs ?? ""}
                    disabled={disabled || !rule.lovCheck}
                    onChange={event => update(index, { lovs: event.target.value || null })}
                  />
                  {criticalitySelect(rule, index, "lovCheckCriticality", rule.lovCheck)}
                </div>
              </TableCell>

              <TableCell>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={rule.riCheck}
                    disabled={disabled}
                    onCheckedChange={value =>
                      toggle(
                        index,
                        "riCheck",
                        ["riConnectionId", "riReferenceTable", "riFieldName", "riCheckCriticality"],
                        Boolean(value)
                      )
                    }
                  />
                  <Input
                    className="h-8 w-28"
                    placeholder="Schema"
                    title="Schema of the reference table. Leave empty to use the connection's own schema."
                    value={splitRiTable(rule.riReferenceTable).schema}
                    disabled={disabled || !rule.riCheck}
                    onChange={event =>
                      update(index, {
                        riReferenceTable: joinRiTable(event.target.value, splitRiTable(rule.riReferenceTable).table),
                      })
                    }
                  />
                  <Input
                    className="h-8 w-28"
                    placeholder="Table"
                    value={splitRiTable(rule.riReferenceTable).table}
                    disabled={disabled || !rule.riCheck}
                    onChange={event =>
                      update(index, {
                        riReferenceTable: joinRiTable(splitRiTable(rule.riReferenceTable).schema, event.target.value),
                      })
                    }
                  />
                  <Input
                    className="h-8 w-28"
                    placeholder="Field"
                    value={rule.riFieldName ?? ""}
                    disabled={disabled || !rule.riCheck}
                    onChange={event => update(index, { riFieldName: event.target.value || null })}
                  />
                  {criticalitySelect(rule, index, "riCheckCriticality", rule.riCheck)}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <DragGhost ghost={reorder.ghost} />
    </div>
  );
}

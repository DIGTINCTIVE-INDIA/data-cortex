import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useApi } from "@/lib/useApi/index.js";
import { DragGhost, DragHandle } from "@/components/ui/custom/DragHandle";
import { clearCache, readCache, writeCache } from "@/lib/localCache";
import { useRowReorder } from "@/lib/reorder";
import { cn } from "@/lib/utils";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FlowSteps } from "../../../components/FlowSteps";
import { SchemaFileDrop } from "@/components/ui/custom/SchemaFileDrop";
import { SchemaSourceChooser } from "../../../components/SchemaSourceChooser";
import { useQcFIleConfProvider, type TraditionalDataType } from "../context/QcFIleConfProvider.js";

export type QcFileRowConfiguration = {
  field: string;
  dataType: TraditionalDataType;
  columnOrder: number;

  primaryKeyCheck?: boolean;
  primaryKeyCheckCriticality?: string | null;

  nullCheck?: boolean;
  nullCheckCriticality?: string | null;

  duplicateCheck?: boolean;
  duplicateCheckCriticality?: string | null;

  lengthCheck?: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  lengthCheckCriticality?: string | null;

  formatCheck?: boolean;
  formatRegex?: string | null;
  formatCheckCriticality?: string | null;

  lovCheck?: boolean;
  lovs?: string | null;
  lovCheckCriticality?: string | null;

  riCheck?: boolean;
  riConnectionId?: string | null;
  riReferenceTable?: string | null;
  riFieldName?: string | null;
  riCheckCriticality?: string | null;
}[];

const criticalityOptions = [
  {
    label: "High",
    value: "high",
  },
  {
    label: "Medium",
    value: "medium",
  },
  {
    label: "Low",
    value: "low",
  },
] as const;

const datatypeOptions = [
  {
    label: "String",
    value: "string",
  },
  {
    label: "Integer",
    value: "integer",
  },
  {
    label: "Float",
    value: "float",
  },
  {
    label: "Date",
    value: "date",
  },
  {
    label: "Datetime",
    value: "datetime",
  },
  {
    label: "Boolean",
    value: "boolean",
  },
  {
    label: "Varchar",
    value: "varchar",
  },
] as const;

type SelectOption<T extends string = string> = {
  label: string;
  value: T;
};

type ConfigSelectProps<T extends string = string> = {
  value?: T | null;
  placeholder?: string;
  width?: string;
  options: readonly SelectOption<T>[];
  onChange: (value: T | null) => void;
  disabled?: boolean;
};

const ConfigSelect = <T extends string>({
  value,
  placeholder = "Select",
  width = "w-[160px]",
  options,
  onChange,
  disabled,
}: ConfigSelectProps<T>) => {
  const selectedOption = options.find(option => option.value === value);

  return (
    <Select value={value ?? undefined} onValueChange={value => onChange(value || null)} disabled={disabled}>
      <SelectTrigger className={width}>
        <SelectValue placeholder={placeholder}>{selectedOption?.label}</SelectValue>
      </SelectTrigger>

      <SelectContent>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const CriticalitySelect = ({
  value,
  onChange,
  disabled,
}: {
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) => {
  return <ConfigSelect value={value} options={criticalityOptions} onChange={onChange} disabled={disabled} />;
};

const DatatypeSelect = ({
  value,
  onChange,
  disabled,
}: {
  value?: TraditionalDataType;
  onChange: (value: TraditionalDataType | null) => void;
  disabled?: boolean;
}) => {
  return (
    <ConfigSelect<TraditionalDataType>
      value={value}
      width="w-[180px]"
      options={datatypeOptions}
      onChange={onChange}
      disabled={disabled}
    />
  );
};

const RiTableSelect = ({
  connectionId,
  value,
  onChange,
  disabled,
}: {
  connectionId?: string | null;
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) => {
  const { data: tablesData } = useApi("GET /api/db/connections/tables", {
    query: {
      connectionId: connectionId || "",
    },
    enabled: !!connectionId,
  });

  const tableOptions =
    tablesData?.data?.tables?.map((table: string) => ({
      label: table,
      value: table,
    })) || [];

  return (
    <ConfigSelect
      value={value}
      width="w-[220px]"
      options={tableOptions}
      onChange={onChange}
      disabled={disabled || !connectionId}
    />
  );
};

const RiColumnSelect = ({
  connectionId,
  tableName,
  value,
  onChange,
  disabled,
}: {
  connectionId?: string | null;
  tableName?: string | null;
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) => {
  const { data: columnsData } = useApi("GET /api/db/connections/columns", {
    query: {
      connectionId: connectionId || "",
      tableName: tableName || "",
    },
    enabled: !!connectionId && !!tableName,
  });

  const columnOptions =
    columnsData?.data?.columns?.map((column: any) => ({
      label: column.columnName,
      value: column.columnName,
    })) || [];

  return (
    <ConfigSelect
      value={value}
      width="w-[220px]"
      options={columnOptions}
      onChange={onChange}
      disabled={disabled || !connectionId || !tableName}
    />
  );
};

const FieldRules = () => {
  const { schema, setSchema, onSaveConfiguration, activeDbConnections, onSchemaFileParsed } = useQcFIleConfProvider();
  const navigate = useNavigate();

  if (!schema) return null;

  // This read `dbConnections`, which the provider has never exposed, so the RI connection
  // dropdown was always empty and referential-integrity checks could not be configured here.
  const dbOptions =
    (activeDbConnections ?? []).map((db: any) => ({
      label: db.connectionName,
      value: db.connectionId,
    })) || [];

  const [rowConfigurations, setRowConfigurations] = useState<QcFileRowConfiguration>(
    schema.columns.map(column => ({
      field: column.columnName,
      dataType: column.dataType ?? "varchar",
      columnOrder: column.columnOrder,

      primaryKeyCheck: false,
      primaryKeyCheckCriticality: null,

      nullCheck: false,
      nullCheckCriticality: null,

      duplicateCheck: false,
      duplicateCheckCriticality: null,

      lengthCheck: false,
      minLength: null,
      maxLength: null,
      lengthCheckCriticality: null,

      formatCheck: false,
      formatRegex: null,
      formatCheckCriticality: null,

      lovCheck: false,
      lovs: null,
      lovCheckCriticality: null,

      riCheck: false,
      riConnectionId: null,
      riReferenceTable: null,
      riFieldName: null,
      riCheckCriticality: null,
    }))
  );

  // Column order drives the order check. Drag a row or use the arrows; numbers are rewritten
  // 1..n from the visible order. Save already numbers columns by position, so what is
  // shown here is what is stored.
  const reorder = useRowReorder(
    rowConfigurations,
    next => setRowConfigurations(next.map((row, position) => ({ ...row, columnOrder: position + 1 }))),
    row => row.field
  );

  // The table is kept in this browser as it is edited (order, ticks, values), so a refresh or a
  // closed tab does not lose it. It is only restored for the same file with the same columns,
  // and cleared once the rules are saved. The restore effect is declared first so it reads the
  // cache before the write effect below replaces it with the defaults on the first render.
  const cacheKey = `rules:file:${schema.fileName}`;
  useEffect(() => {
    const names = schema.columns.map(column => column.columnName).sort().join("|");
    const cached = readCache<QcFileRowConfiguration>(
      cacheKey,
      value => Array.isArray(value) && value.map(row => (row as { field: string }).field).sort().join("|") === names
    );

    if (cached) setRowConfigurations(cached);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    writeCache(cacheKey, rowConfigurations);
  }, [cacheKey, rowConfigurations]);

  const updateRowConfiguration = (rowIndex: number, key: string, value: any) => {
    setRowConfigurations(prev =>
      prev.map((row, index) => {
        if (index !== rowIndex) {
          return row;
        }

        const updatedRow = {
          ...row,
          [key]: value,
        };

        // Turning a check on starts it at "medium", so it is saveable without a second
        // click on the select. Only fills an empty level; never overwrites a chosen one.
        const defaultCriticality: Record<string, string> = {
          primaryKeyCheck: "primaryKeyCheckCriticality",
          nullCheck: "nullCheckCriticality",
          duplicateCheck: "duplicateCheckCriticality",
          lengthCheck: "lengthCheckCriticality",
          formatCheck: "formatCheckCriticality",
          lovCheck: "lovCheckCriticality",
          riCheck: "riCheckCriticality",
        };
        const levelKey = defaultCriticality[key];
        if (levelKey && value === true && !(updatedRow as Record<string, unknown>)[levelKey]) {
          (updatedRow as Record<string, unknown>)[levelKey] = "medium";
        }

        // LENGTH CHECK
        if (key === "lengthCheck" && value === false) {
          updatedRow.minLength = null;
          updatedRow.maxLength = null;
          updatedRow.lengthCheckCriticality = null;
        }

        // FORMAT CHECK
        if (key === "formatCheck" && value === false) {
          updatedRow.formatRegex = null;
          updatedRow.formatCheckCriticality = null;
        }

        // LOV CHECK
        if (key === "lovCheck" && value === false) {
          updatedRow.lovs = null;
          updatedRow.lovCheckCriticality = null;
        }

        // RI CHECK
        if (key === "riCheck" && value === false) {
          updatedRow.riConnectionId = null;
          updatedRow.riReferenceTable = null;
          updatedRow.riFieldName = null;
          updatedRow.riCheckCriticality = null;
        }

        // PK CHECK
        if (key === "primaryKeyCheck" && value === false) {
          updatedRow.primaryKeyCheckCriticality = null;
        }

        // NULL CHECK
        if (key === "nullCheck" && value === false) {
          updatedRow.nullCheckCriticality = null;
        }

        // DUPLICATE CHECK
        if (key === "duplicateCheck" && value === false) {
          updatedRow.duplicateCheckCriticality = null;
        }

        return updatedRow;
      })
    );
  };

  return (
    <div className="space-y-8">
      {/* The form lives in the layout's provider, so going back finds it as it was left. */}
      <FlowSteps
        steps={[
          { label: "Configuration", to: "/admin/quality-checks/qc-configuration/data-conformance/file" },
          { label: "Field rules" },
        ]}
        current={1}
      />

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Field rules</h1>

        <p className="text-sm text-muted-foreground">
          Configuring: {schema.fileName}
          <button
            type="button"
            onClick={() => {
              setSchema(null);
              onSchemaFileParsed([], "");
            }}
            className="ml-3 text-primary underline-offset-4 hover:underline">
            Change expected schema
          </button>
        </p>
      </div>

      <div className="rounded-3xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">File: {schema.fileName}</h2>

            <p className="text-sm text-muted-foreground mt-1">{schema.columns.length} columns detected</p>
          </div>

          {schema.rowsScanned > 0 && (
            <div className="text-right">
              <p className="text-sm font-medium text-foreground">Rows Scanned</p>

              <p className="text-2xl font-semibold text-primary">{schema.rowsScanned}</p>
            </div>
          )}
        </div>

        <div className="overflow-x-auto overflow-y-hidden ">
          <Table className="min-w-[4200px] ">
            <TableHeader className="bg-muted/40 ">
              <TableRow className="hover:bg-transparent">
                {/* <TableHead className="p-4">Skip</TableHead> */}

                <TableHead className="w-28 p-4">Order</TableHead>
                <TableHead className="p-4">Column Name</TableHead>
                <TableHead>Datatype</TableHead>

                <TableHead>PK Check</TableHead>
                <TableHead>PK Criticality</TableHead>

                <TableHead>Null Check</TableHead>
                <TableHead>Null Criticality</TableHead>

                <TableHead>Duplicate Check</TableHead>
                <TableHead>Duplicate Criticality</TableHead>

                <TableHead>Length Check</TableHead>
                <TableHead>Min Length</TableHead>
                <TableHead>Max Length</TableHead>
                <TableHead>Length Criticality</TableHead>

                <TableHead>Format Check</TableHead>
                <TableHead>Format Regex</TableHead>
                <TableHead>Format Criticality</TableHead>

                <TableHead>LOV Check</TableHead>
                <TableHead>LOVs</TableHead>
                <TableHead>LOV Criticality</TableHead>

                <TableHead>RI Check</TableHead>
                <TableHead>RI DB Connection</TableHead>
                <TableHead>RI Reference Table</TableHead>
                <TableHead>RI Field Name</TableHead>
                <TableHead>RI Criticality</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rowConfigurations.map((row, index) => (
                <TableRow
                  key={row.field}
                  {...reorder.rowProps(index)}
                  className={cn("hover:bg-muted/20", reorder.rowClass(index))}>
                  {/* <TableCell className="p-4">
                    <div className="flex items-center gap-2">
                      <Checkbox className="border-blue-500" />

                      <span className="text-sm text-muted-foreground">Skip</span>
                    </div>
                  </TableCell> */}

                  <TableCell className="p-4 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <DragHandle {...reorder.handleProps(index, row.field)} title="Drag to reorder" />
                      <span className="w-5 text-right tabular-nums">{row.columnOrder}</span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1 ml-3">
                      {/* The old "Nullable / Not Nullable" line was removed: an uploaded schema
                          never says, and the page set every column to nullable, so it always
                          read "Nullable" whatever the column was. */}
                      <p className="font-medium text-foreground">{row.field}</p>
                    </div>
                  </TableCell>

                  <TableCell>
                    <DatatypeSelect
                      value={rowConfigurations[index]?.dataType}
                      onChange={value => updateRowConfiguration(index, "dataType", value)}
                    />
                  </TableCell>

                  <TableCell>
                    <Checkbox
                      checked={!!rowConfigurations[index]?.primaryKeyCheck}
                      onCheckedChange={checked => updateRowConfiguration(index, "primaryKeyCheck", !!checked)}
                      className="border-blue-500"
                    />
                  </TableCell>

                  <TableCell>
                    <CriticalitySelect
                      value={rowConfigurations[index]?.primaryKeyCheckCriticality}
                      onChange={value => updateRowConfiguration(index, "primaryKeyCheckCriticality", value)}
                      disabled={!rowConfigurations[index]?.primaryKeyCheck}
                    />
                  </TableCell>

                  <TableCell>
                    <Checkbox
                      checked={!!rowConfigurations[index]?.nullCheck}
                      onCheckedChange={checked => updateRowConfiguration(index, "nullCheck", !!checked)}
                      className="border-blue-500"
                    />
                  </TableCell>

                  <TableCell>
                    <CriticalitySelect
                      value={rowConfigurations[index]?.nullCheckCriticality}
                      onChange={value => updateRowConfiguration(index, "nullCheckCriticality", value)}
                      disabled={!rowConfigurations[index]?.nullCheck}
                    />
                  </TableCell>

                  <TableCell>
                    <Checkbox
                      checked={!!rowConfigurations[index]?.duplicateCheck}
                      onCheckedChange={checked => updateRowConfiguration(index, "duplicateCheck", !!checked)}
                      className="border-blue-500"
                    />
                  </TableCell>

                  <TableCell>
                    <CriticalitySelect
                      value={rowConfigurations[index]?.duplicateCheckCriticality}
                      onChange={value => updateRowConfiguration(index, "duplicateCheckCriticality", value)}
                      disabled={!rowConfigurations[index]?.duplicateCheck}
                    />
                  </TableCell>

                  <TableCell>
                    <Checkbox
                      checked={!!rowConfigurations[index]?.lengthCheck}
                      onCheckedChange={checked => updateRowConfiguration(index, "lengthCheck", !!checked)}
                      className="border-blue-500"
                    />
                  </TableCell>

                  <TableCell>
                    <input
                      type="number"
                      value={rowConfigurations[index]?.minLength || ""}
                      onChange={e =>
                        updateRowConfiguration(index, "minLength", e.target.value ? Number(e.target.value) : null)
                      }
                      placeholder="Min length"
                      disabled={!rowConfigurations[index]?.lengthCheck}
                      className="flex h-10 w-[160px] rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </TableCell>

                  <TableCell>
                    <input
                      type="number"
                      value={rowConfigurations[index]?.maxLength || ""}
                      onChange={e =>
                        updateRowConfiguration(index, "maxLength", e.target.value ? Number(e.target.value) : null)
                      }
                      placeholder="Max length"
                      disabled={!rowConfigurations[index]?.lengthCheck}
                      className="flex h-10 w-[160px] rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </TableCell>

                  <TableCell>
                    <CriticalitySelect
                      value={rowConfigurations[index]?.lengthCheckCriticality}
                      onChange={value => updateRowConfiguration(index, "lengthCheckCriticality", value)}
                      disabled={!rowConfigurations[index]?.lengthCheck}
                    />
                  </TableCell>

                  <TableCell>
                    <Checkbox
                      checked={!!rowConfigurations[index]?.formatCheck}
                      onCheckedChange={checked => updateRowConfiguration(index, "formatCheck", !!checked)}
                      className="border-blue-500"
                    />
                  </TableCell>

                  <TableCell>
                    <input
                      value={rowConfigurations[index]?.formatRegex || ""}
                      onChange={e => updateRowConfiguration(index, "formatRegex", e.target.value)}
                      placeholder="Regex pattern"
                      disabled={!rowConfigurations[index]?.formatCheck}
                      className="flex h-10 w-[200px] rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </TableCell>

                  <TableCell>
                    <CriticalitySelect
                      value={rowConfigurations[index]?.formatCheckCriticality}
                      onChange={value => updateRowConfiguration(index, "formatCheckCriticality", value)}
                      disabled={!rowConfigurations[index]?.formatCheck}
                    />
                  </TableCell>

                  <TableCell>
                    <Checkbox
                      checked={!!rowConfigurations[index]?.lovCheck}
                      onCheckedChange={checked => updateRowConfiguration(index, "lovCheck", !!checked)}
                      className="border-blue-500"
                    />
                  </TableCell>

                  <TableCell>
                    <input
                      value={rowConfigurations[index]?.lovs || ""}
                      onChange={e => updateRowConfiguration(index, "lovs", e.target.value)}
                      placeholder="Enter LOVs"
                      disabled={!rowConfigurations[index]?.lovCheck}
                      className="flex h-10 w-[200px] rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </TableCell>

                  <TableCell>
                    <CriticalitySelect
                      value={rowConfigurations[index]?.lovCheckCriticality}
                      onChange={value => updateRowConfiguration(index, "lovCheckCriticality", value)}
                      disabled={!rowConfigurations[index]?.lovCheck}
                    />
                  </TableCell>

                  <TableCell>
                    <Checkbox
                      checked={!!rowConfigurations[index]?.riCheck}
                      onCheckedChange={checked => updateRowConfiguration(index, "riCheck", !!checked)}
                      className="border-blue-500"
                    />
                  </TableCell>

                  <TableCell>
                    <ConfigSelect
                      value={rowConfigurations[index]?.riConnectionId}
                      width="w-[220px]"
                      options={dbOptions}
                      onChange={value => {
                        updateRowConfiguration(index, "riConnectionId", value);
                        updateRowConfiguration(index, "riReferenceTable", null);
                        updateRowConfiguration(index, "riFieldName", null);
                      }}
                      disabled={!rowConfigurations[index]?.riCheck}
                    />
                  </TableCell>

                  <TableCell>
                    <RiTableSelect
                      connectionId={rowConfigurations[index]?.riConnectionId}
                      value={rowConfigurations[index]?.riReferenceTable}
                      onChange={value => {
                        updateRowConfiguration(index, "riReferenceTable", value);
                        updateRowConfiguration(index, "riFieldName", null);
                      }}
                      disabled={!rowConfigurations[index]?.riCheck}
                    />
                  </TableCell>

                  <TableCell>
                    <TableCell>
                      <RiColumnSelect
                        connectionId={rowConfigurations[index]?.riConnectionId}
                        tableName={rowConfigurations[index]?.riReferenceTable}
                        value={rowConfigurations[index]?.riFieldName}
                        onChange={value => updateRowConfiguration(index, "riFieldName", value)}
                        disabled={!rowConfigurations[index]?.riCheck}
                      />
                    </TableCell>
                  </TableCell>

                  <TableCell>
                    <CriticalitySelect
                      value={rowConfigurations[index]?.riCheckCriticality}
                      onChange={value => updateRowConfiguration(index, "riCheckCriticality", value)}
                      disabled={!rowConfigurations[index]?.riCheck}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/10">
          <Button variant="outline" onClick={() => navigate("/admin/quality-checks/qc-configuration/data-conformance/file")}>
            <HugeiconsIcon icon={ArrowLeft02Icon} size={16} />
            Back
          </Button>

          <Button
            onClick={() =>
              Promise.resolve(onSaveConfiguration(rowConfigurations))
                .then(() => clearCache(cacheKey))
                .catch(() => undefined)
            }>
            Save field rules
          </Button>
        </div>
      </div>

      <DragGhost ghost={reorder.ghost} />
    </div>
  );
};

/**
 * Step two. The expected schema is chosen here, before the rules that are set per column:
 * it is what produces the columns, so asking for it on the first page put a decision about
 * the file's contents ahead of the question of where the file is.
 */
const ColumnMapping = () => {
  const {
    schema,
    setSchema,
    watch,
    isGettingSchema,
    fetchSchemaFromSource,
    isAwsS3,
    uploadedColumns,
    uploadedFileName,
    onSchemaFileParsed,
  } = useQcFIleConfProvider();

  const values = watch();

  const useUploadedSchema = () => {
    if (!uploadedColumns.length) return;

    setSchema({
      fileName: uploadedFileName ?? values.sourceFileName,
      sourceFileType: values.sourceFileType,
      sourceConnectionId: values.sourceConnectionId,
      rowsScanned: 0,
      columns: uploadedColumns.map(row => ({
        columnName: row.field,
        columnOrder: row.columnOrder,
        dataType: row.dataType,
        nullable: true,
      })),
    });
  };

  // As in the database flow, columns that have been read or uploaded go straight to the field rules:
  // there is no separate "continue" step to remember.
  useEffect(() => {
    if (!schema && uploadedColumns.length > 0) useUploadedSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedColumns, schema]);

  if (schema) return <FieldRules />;

  return (
    <div className="space-y-8">
      <FlowSteps
        steps={[
          { label: "Configuration", to: "/admin/quality-checks/qc-configuration/data-conformance/file" },
          { label: "Field rules" },
        ]}
        current={1}
      />

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Expected schema</h1>
        <p className="text-sm text-muted-foreground">The columns this file should have, before you set rules on each.</p>
      </div>

      <div className="space-y-6 rounded-3xl border border-border bg-card p-6">
        <SchemaSourceChooser
          onFetch={fetchSchemaFromSource}
          isFetching={isGettingSchema}
          canFetch={isAwsS3}
          fetchBlockedReason="Choose S3 as the file location and a source connection first."
          loadedColumns={uploadedColumns.length}
          sourceLabel={values.sourceFileName || undefined}
          uploadPanel={
            <SchemaFileDrop
              onParsed={onSchemaFileParsed}
              loadedFileName={uploadedFileName}
              loadedRowCount={uploadedColumns.length}
              compact
            />
          }
        />

      </div>
    </div>
  );
};

export default ColumnMapping;

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  ArrowLeft02Icon,
  CheckmarkCircle02Icon,
  CodeIcon,
  LinkSquare02Icon,
  ShieldEnergyIcon,
  SqlIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Controller } from "react-hook-form";
import { Link } from "react-router";

import { SqlEditor } from "@/components/ui/custom/SqlEditor";
import { SqlSchemaExplorer } from "@/components/ui/custom/SqlSchemaExplorer";
import { useApi } from "@/lib/useApi";
import type { SqlEditorSchema } from "@/lib/useApi/types/qcConfigurationApis.types";
import { DownstreamPicker } from "../components/DownstreamPicker";
import { FormSection } from "../components/FormSection";
import { customSqlCheckValidation } from "./customSqlCheck.schema";
import useCreateCustomSqlCheck from "./useCreateCustomSqlCheck";

const CustomSqlCheckPage = () => {
  const {
    form,
    onSubmit,

    selectedDB,

    workstreams,
    categories,
    dataSources,
    downstreams,
    activeConnections,
    criticalityOptions,

    selectedDownstreams,
    toggleDownstream,

    isLibrariesPending,
    isConnectionsPending,
    isSaving,
    onValidateQuery,
    isValidating,
  } = useCreateCustomSqlCheck();

  const {
    register,
    control,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const selectedSourceConnectionId = watch("sourceConnectionId");

  const sqlEditorSchema = useApi("GET /api/qc-configuration/custom-sql/schema", {
    query: {
      connectionId: selectedSourceConnectionId,
    },
    enabled: !!selectedSourceConnectionId,
  }) as any;

  const schemas = ((sqlEditorSchema.data?.data.result?.schemas as any) ?? []) as SqlEditorSchema[];

  const sqlQuery = watch("sqlQuery");

  return (
    <div className="space-y-8">
      <Link
        to="/admin/quality-checks/qc-configuration"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition">
        <HugeiconsIcon icon={ArrowLeft02Icon} size={18} />
        Back to QC Configuration
      </Link>

      <div className="flex items-start justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Custom SQL Check Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Configure quality checks using custom SQL queries and map failed records to target outputs.
          </p>
        </div>

        <div className="hidden md:flex size-11 rounded-2xl bg-primary/10 text-primary items-center justify-center">
          <HugeiconsIcon icon={SqlIcon} size={22} />
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <div className="rounded-3xl bg-muted p-2">
          <div className="rounded-[22px] bg-background p-6 md:p-7 space-y-8">
            <div className="flex items-start gap-4">
              <div className="size-12 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <HugeiconsIcon icon={CodeIcon} size={22} />
              </div>

              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">SQL Check Details</h2>
                <p className="text-sm text-muted-foreground">
                  Define the rule metadata, source and target connections, SQL query, and error message.
                </p>
              </div>
            </div>

            <FormSection>
              <div className="grid grid-cols-1 gap-5">
              <Input
                label="Check Name"
                required
                error={errors.checkName?.message}
                placeholder="Missing customer identifiers"
                {...register("checkName", customSqlCheckValidation.checkName)}
              />
              </div>

            <Textarea
              label="Description"
              {...register("checkDescription")}
              placeholder="Optional description of what this check validates..."
              className="min-h-[100px] resize-y"
            />
            </FormSection>

            <FormSection step={1} title="Classification" description="How this check is grouped and who is affected when it fails.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Controller
                name="workstreamId"
                control={control}
                rules={customSqlCheckValidation.workstreamId}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      label="Workstream"
                      required
                      error={errors.workstreamId?.message}
                      isLoading={isLibrariesPending}>
                      <SelectValue placeholder="Select workstream">
                        {workstreams.find((item: any) => String(item.id) === String(field.value))?.tagTitle ?? ""}
                      </SelectValue>
                    </SelectTrigger>

                    <SelectContent>
                      {workstreams.map((item: any) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.tagTitle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />

              <Controller
                name="categoryId"
                control={control}
                rules={customSqlCheckValidation.categoryId}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      label="Check Category"
                      required
                      error={errors.categoryId?.message}
                      isLoading={isLibrariesPending}>
                      <SelectValue placeholder="Select check category">
                        {categories.find((item: any) => String(item.id) === String(field.value))?.tagTitle ?? ""}
                      </SelectValue>
                    </SelectTrigger>

                    <SelectContent>
                      {categories.map((item: any) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.tagTitle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />

              <Controller
                name="dataSourceId"
                control={control}
                rules={customSqlCheckValidation.dataSourceId}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      label="Data Source"
                      required
                      error={errors.dataSourceId?.message}
                      isLoading={isLibrariesPending}>
                      <SelectValue placeholder="Select data source">
                        {dataSources.find((item: any) => String(item.id) === String(field.value))?.tagTitle ?? ""}
                      </SelectValue>
                    </SelectTrigger>

                    <SelectContent>
                      {dataSources.map((item: any) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.tagTitle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <DownstreamPicker
                items={downstreams}
                selected={selectedDownstreams}
                onToggle={toggleDownstream}
                isLoading={isLibrariesPending}
                required
                error={errors.impactedDownstreamId?.message}
              />
              </div>
            </FormSection>

            <FormSection step={2} title="Connections" description="Where the query runs, and where passing and failing rows are written.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Controller
                name="sourceConnectionId"
                control={control}
                rules={customSqlCheckValidation.sourceConnectionId}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      label="Source DB Connection"
                      required
                      error={errors.sourceConnectionId?.message}
                      isLoading={isConnectionsPending}>
                      <SelectValue placeholder="Select source DB connection">
                        {
                          activeConnections.find((item: any) => String(item.connectionId) === String(field.value))
                            ?.connectionName
                        }
                      </SelectValue>
                    </SelectTrigger>

                    <SelectContent>
                      {activeConnections.map((db: any) => (
                        <SelectItem key={db.connectionId} value={String(db.connectionId)}>
                          {db.connectionName || db.connectionId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />

              <Controller
                name="targetConnectionId"
                control={control}
                rules={customSqlCheckValidation.targetConnectionId}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      label="Target DB Connection"
                      required
                      error={errors.targetConnectionId?.message}
                      isLoading={isConnectionsPending}>
                      <SelectValue placeholder="Select target DB connection">
                        {
                          activeConnections.find((item: any) => String(item.connectionId) === String(field.value))
                            ?.connectionName
                        }
                      </SelectValue>
                    </SelectTrigger>

                    <SelectContent>
                      {activeConnections.map((db: any) => (
                        <SelectItem key={db.connectionId} value={String(db.connectionId)}>
                          {db.connectionName || db.connectionId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />

              <Input
                label="Target Table Prefix"
                required
                error={errors.targetTablePrefix?.message}
                className="font-mono"
                placeholder="custom_sql_"
                {...register("targetTablePrefix", customSqlCheckValidation.targetTablePrefix)}
              />
              </div>

            {selectedDB && (
              <div className="rounded-2xl bg-muted/40 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <HugeiconsIcon icon={LinkSquare02Icon} size={18} className="text-primary" />
                  <p className="text-sm font-medium text-foreground">Selected Source Connection</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Meta label="Type" value={selectedDB.databaseType} />
                  <Meta label="Host" value={selectedDB.host} />
                  <Meta label="Port" value={selectedDB.port} />
                  <Meta label="Database" value={selectedDB.databaseName} />
                  <Meta label="Username" value={selectedDB.username} />
                  <Meta label="Schema" value={selectedDB.dbSchema} />
                </div>
              </div>
            )}
            </FormSection>

            <FormSection step={3} title="Query" description="The SQL that selects the rows which should fail.">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">
                  SQL Query <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Type table names, column names, or use aliases like <span className="font-mono">u.</span>. Press
                  Ctrl/Cmd + Space for suggestions.
                </p>
              </div>

              <div className="rounded-[calc(var(--radius)+4px)] border border-border bg-card p-3">
                <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="relative z-50 min-w-0 overflow-visible">
                    <Controller
                      name="sqlQuery"
                      control={control}
                      rules={customSqlCheckValidation.sqlQuery}
                      render={({ field }) => (
                        <SqlEditor
                          value={field.value ?? ""}
                          onChange={value => {
                            setValue("sqlQuery", value, {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true,
                            });

                            field.onChange(value);
                          }}
                          schemas={schemas}
                          height="360px"
                          disabled={!selectedSourceConnectionId}
                        />
                      )}
                    />
                    {errors.sqlQuery?.message && (
                      <p className="text-xs font-medium text-destructive">{errors.sqlQuery.message}</p>
                    )}
                  </div>

                  <SqlSchemaExplorer
                    schemas={schemas}
                    // The query is disabled until a connection is picked, and a disabled
                    // query reports isPending forever -- so this showed a loading
                    // skeleton before anything had been asked for.
                    isLoading={Boolean(selectedSourceConnectionId) && sqlEditorSchema.isPending}
                    onRefresh={() => sqlEditorSchema.refetch()}
                    height="360px"
                  />
                </div>
              </div>

              {!selectedSourceConnectionId && (
                <p className="text-xs font-medium text-warning">
                  Select source DB connection first to enable schema autocomplete.
                </p>
              )}
            </div>
            </FormSection>

            <FormSection step={4} title="When it fails" description="How serious a failure is, and what people are told.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Controller
                name="criticality"
                control={control}
                rules={customSqlCheckValidation.criticality}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger label="Criticality" required error={errors.criticality?.message}>
                      <SelectValue placeholder="Select criticality level">
                        {criticalityOptions.find(item => String(item.value) === String(field.value))?.label}
                      </SelectValue>
                    </SelectTrigger>

                    <SelectContent>
                      {criticalityOptions.map(item => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              </div>

            <Input
              label="Error Message"
              required
              error={errors.errorMessage?.message}
              placeholder="Message shown when this check fails"
              {...register("errorMessage", customSqlCheckValidation.errorMessage)}
            />
            </FormSection>

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                requires="configure"
                disabled={selectedSourceConnectionId == "" || sqlQuery == ""}
                isLoading={isValidating}
                onClick={onValidateQuery}
                type="button"
                variant="outlinePrimary">
                <HugeiconsIcon icon={ShieldEnergyIcon} size={18} />
                Validate Query
              </Button>

              <div className="flex items-center gap-3">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>

                <Button requires="configure" type="submit" isLoading={isSaving}>
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} />
                  Save Configuration
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default CustomSqlCheckPage;
const Meta = ({ label, value }: { label: string; value?: any }) => {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      <p className="text-sm font-medium text-foreground truncate">{value || "—"}</p>
    </div>
  );
};

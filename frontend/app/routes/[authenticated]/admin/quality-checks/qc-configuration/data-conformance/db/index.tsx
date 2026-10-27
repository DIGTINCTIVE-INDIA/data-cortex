import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  ArrowLeft02Icon,
  CheckmarkCircle02Icon,
  DatabaseIcon,
  LinkSquare02Icon,
  WorkflowSquare09Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Controller } from "react-hook-form";
import { Link } from "react-router";

import { DownstreamPicker } from "../../components/DownstreamPicker";
import { FlowSteps } from "../../components/FlowSteps";
import { FormSection } from "../../components/FormSection";
import { LandingTableField } from "../../components/LandingTableField";
import { databaseCheckValidation } from "./databaseCheck.schema";
import useCreateDBCheck from "./useCreateDBCheck";

const DatabaseCheckPage = () => {
  const {
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

    isLibrariesPending,
    isTablesListLoading,
    isSaving,
    editingId,
  } = useCreateDBCheck();

  const {
    register,
    control,
    watch,
    formState: { errors },
  } = form;

  const targetTablePrefix = watch("targetTableNamePrefix");

  return (
    <div className="space-y-8">
      <Link
        to="/admin/quality-checks/qc-configuration"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition">
        <HugeiconsIcon icon={ArrowLeft02Icon} size={18} />
        Back to QC Configuration
      </Link>

      <FlowSteps steps={[{ label: "Configuration" }, { label: "Field rules" }]} current={0} />

      <div className="flex items-start justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Database Conformance Check</h1>
          <p className="text-sm text-muted-foreground">
            Configure source validation, downstream mapping, and target output in one flow.
          </p>
        </div>

        <div className="hidden md:flex size-11 rounded-2xl bg-primary/10 text-primary items-center justify-center">
          <HugeiconsIcon icon={DatabaseIcon} size={22} />
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate>
        <div className="rounded-3xl bg-muted p-2">
          <div className="rounded-[22px] bg-background p-6 md:p-7 space-y-8">
            <div className="flex items-start gap-4">
              <div className="size-12 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <HugeiconsIcon icon={WorkflowSquare09Icon} size={22} />
              </div>

              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">Configuration Details</h2>
                <p className="text-sm text-muted-foreground">
                  Fill the required information below to create a database conformance rule.
                </p>
              </div>
            </div>

            <FormSection>
              <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
                <Input
                  label="Check Name"
                  required
                  error={errors.checkName?.message}
                  placeholder="Customer Data Completeness"
                  {...register("checkName", databaseCheckValidation.checkName)}
                />

                <Textarea
                  label="Description"
                  {...register("description")}
                  placeholder="Write a short description..."
                  className="h-11 min-h-11 resize-y py-2.5"
                />
              </div>
            </FormSection>

            <FormSection step={1} title="Classification" description="How this check is grouped and who is affected when it fails.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Controller
                name="workstreamId"
                control={control}
                rules={databaseCheckValidation.workstreamId}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      empty={!isLibrariesPending && workstreams.length === 0}
                      emptyText="No workstreams configured yet"
                      label="Impacted Workstream"
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
                rules={databaseCheckValidation.categoryId}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      required
                      label="Category"
                      empty={!isLibrariesPending && categories.length === 0}
                      emptyText="No categories configured yet"
                      isLoading={isLibrariesPending}>
                      <SelectValue placeholder="Select category">
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
                rules={databaseCheckValidation.dataSourceId}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      required
                      label="Data Source"
                      empty={!isLibrariesPending && dataSources.length === 0}
                      emptyText="No data sources configured yet"
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
              />
              </div>
            </FormSection>

            <FormSection step={2} title="Source & target" description="Where the data is read from, and where passing and failing rows are written.">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Controller
                name="sourceDbId"
                control={control}
                rules={databaseCheckValidation.sourceDbId}
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    onValueChange={v => {
                      if (!v) return;
                      handleSourceDbChange(v);
                    }}>
                    <SelectTrigger
                      label="Source Database"
                      required
                      empty={activeConnections.length === 0}
                      emptyText="No database connections yet"
                      error={errors.sourceDbId?.message}>
                      <SelectValue placeholder="Select source connection">
                        {
                          activeConnections.find((item: any) => String(item.connectionId) === String(field.value))
                            ?.connectionName
                        }
                      </SelectValue>
                    </SelectTrigger>

                    <SelectContent>
                      {activeConnections.map((db: any) => (
                        <SelectItem key={db.connectionId} value={String(db.connectionId)}>
                          {db.connectionName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />

              <Controller
                name="sourceTableName"
                control={control}
                rules={databaseCheckValidation.sourceTableName}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      isLoading={isTablesListLoading && !!sourceDbId}
                      disabled={!sourceDbId}
                      empty={!!sourceDbId && !isTablesListLoading && sourceTables.length === 0}
                      emptyText="No tables found in this database"
                      label="Source Table Name"
                      required
                      error={errors.sourceTableName?.message}>
                      <SelectValue placeholder="Select source table">{field.value}</SelectValue>
                    </SelectTrigger>

                    <SelectContent>
                      {sourceTables.map((table: string) => (
                        <SelectItem key={table} value={table}>
                          {table}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              </div>

            {selectedDB && (
              <div className="rounded-2xl bg-muted/40 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <HugeiconsIcon icon={LinkSquare02Icon} size={18} className="text-primary" />
                  <p className="text-sm font-medium text-foreground">Selected Connection Details</p>
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

              <div className="mt-9 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Controller
                name="targetConnectionId"
                control={control}
                rules={databaseCheckValidation.targetConnectionId}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      label="Target Connection"
                      required
                      empty={activeConnections.length === 0}
                      emptyText="No database connections yet"
                      error={errors.targetConnectionId?.message}>
                      <SelectValue placeholder="Select target connection">
                        {
                          activeConnections.find((item: any) => String(item.connectionId) === String(field.value))
                            ?.connectionName
                        }
                      </SelectValue>
                    </SelectTrigger>

                    <SelectContent>
                      {activeConnections.map((db: any) => (
                        <SelectItem key={db.connectionId} value={String(db.connectionId)}>
                          {db.connectionName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />

              <Input
                label="Target Prefix"
                required
                error={errors.targetTableNamePrefix?.message}
                className="font-mono"
                placeholder="conformed_"
                hint="The result tables are created as the prefix followed by _err and _valid."
                ghost={{ typed: targetTablePrefix ?? "", suffix: "_err" }}
                {...register("targetTableNamePrefix", databaseCheckValidation.targetTableNamePrefix)}
              />
              </div>


                <Controller
                  name="createLanding"
                  control={control}
                  render={({ field }) => (
                    <LandingTableField
                      checked={Boolean(field.value)}
                      onCheckedChange={field.onChange}
                      error={errors.landingTable?.message}
                      inputProps={register("landingTable", createLanding ? databaseCheckValidation.landingTable : undefined)}
                    />
                  )}
                />
              </div>
            </FormSection>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" variant="secondary">
                Cancel
              </Button>

              <Button requires="configure" type="submit" isLoading={isSaving}>
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} />
                {editingId ? "Save Changes & Configure Fields" : "Save & Configure Fields"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default DatabaseCheckPage;

const Meta = ({ label, value }: { label: string; value?: any }) => {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      <p className="text-sm font-medium text-foreground truncate">{value || "—"}</p>
    </div>
  );
};

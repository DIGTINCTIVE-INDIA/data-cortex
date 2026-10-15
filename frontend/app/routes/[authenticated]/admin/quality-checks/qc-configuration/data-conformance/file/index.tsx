import { Controller } from "react-hook-form";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  ArrowLeft02Icon,
  ArrowRight02FreeIcons,
  File01Icon,
  FileValidationIcon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { fileAvailableOnOptions, fileTypes, useQcFIleConfProvider } from "./context/QcFIleConfProvider.js";
import { SchemaFileDrop } from "@/components/ui/custom/SchemaFileDrop";
import { toast } from "sonner";
import { DownstreamPicker } from "../../components/DownstreamPicker";
import { FlowSteps } from "../../components/FlowSteps";
import { FormSection } from "../../components/FormSection";
import { SchemaSourceChooser } from "../../components/SchemaSourceChooser";

/**
 * Splits a pasted object key into its folder and its file.
 *
 * People paste the whole key ("/healthcare/customer_master.csv") into the path
 * field, which then disagrees with its own label and puts the file name into the
 * pickup URL twice. Returns null when the last segment does not look like a file,
 * so an ordinary folder path is left alone.
 */
const splitPathAndFile = (raw: string) => {
  const value = raw.trim().replace(/\\/g, "/");
  const segments = value.split("/").filter(Boolean);
  const last = segments[segments.length - 1];

  if (!last || !last.includes(".")) return null;

  const folder = segments.slice(0, -1).join("/");

  // The field's own hint says no extension.
  return { path: folder ? `/${folder}` : "/", file: last.replace(/\.[^.]+$/, "") };
};

const FileBasedCheckPage = () => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    errors,

    selectedDownstreams,
    toggleDownstream,

    isPending,

    activeFileConnections,
    activeDbConnections,

    workstreamItems,
    categoryItems,
    dataSourceItems,
    downstreamItems,
    isGettingSchema,
    fetchSchemaFromSource,
    createLanding,
    fileAvailableOn,
    isAwsS3,
    selectedFileConnection,
    s3PickupUrl,

    onSubmit,
    setValue,
    uploadedColumns,
    uploadedFileName,
    onSchemaFileParsed,
  } = useQcFIleConfProvider();


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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Data Conformance Checks - File</h1>
          <p className="text-sm text-muted-foreground">
            Configure file quality checks from storage sources and map outputs to target database tables.
          </p>
        </div>

        <div className="hidden md:flex size-11 rounded-2xl bg-primary/10 text-primary items-center justify-center">
          <HugeiconsIcon icon={FileValidationIcon} size={22} />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="rounded-3xl bg-muted/40 p-2">
          <div className="rounded-[22px] bg-background p-6 md:p-7 space-y-8">
            <div className="flex items-start gap-4">
              <div className="size-12 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <HugeiconsIcon icon={File01Icon} size={22} />
              </div>

              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">File Check Configuration</h2>
                <p className="text-sm text-muted-foreground">
                  Select source file details, downstream impact, and target output settings.
                </p>
              </div>
            </div>

            <FormSection step={1} title="Basics" description="What this check is called.">
              <div className="grid grid-cols-1 gap-5">
              <Input
                required
                label="Check Name"
                error={errors.checkName?.message}
                placeholder="Customer File Conformance"
                {...register("checkName", {
                  required: "Check name is required",
                  minLength: {
                    value: 3,
                    message: "Minimum 3 characters required",
                  },
                })}
              />
              </div>
            </FormSection>

            <FormSection step={2} title="Classification" description="How this check is grouped and who is affected when it fails.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Controller
                name="workstreamId"
                control={control}
                rules={{ required: "Please select a workstream" }}
                render={({ field }) => {
                  const selected = workstreamItems.find((item: any) => item.id === field.value);

                  return (
                    <Select
                      value={field.value ? String(field.value) : undefined}
                      onValueChange={value => field.onChange(Number(value))}>
                      <SelectTrigger
                        isLoading={isPending}
                        required
                        label="Impacted Workstream"
                        error={errors.workstreamId?.message}>
                        <SelectValue placeholder="Select workstream">{selected?.tagTitle}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {workstreamItems.map(item => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.tagTitle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
              />

              <Controller
                name="categoryId"
                control={control}
                rules={{ required: "Please select a category" }}
                render={({ field }) => {
                  const selected = categoryItems.find((item: any) => item.id === field.value);

                  return (
                    <Select
                      value={field.value ? String(field.value) : undefined}
                      onValueChange={value => field.onChange(Number(value))}>
                      <SelectTrigger required isLoading={isPending} label="Check Category" error={errors.categoryId?.message}>
                        <SelectValue placeholder="Select check category">{selected?.tagTitle}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {categoryItems.map(item => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.tagTitle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
              />

              <Controller
                name="dataSourceId"
                control={control}
                rules={{ required: "Please select a data source" }}
                render={({ field }) => {
                  const selected = dataSourceItems?.find((item: any) => item.id === field.value);

                  return (
                    <Select
                      value={field.value ? String(field.value) : undefined}
                      onValueChange={value => field.onChange(Number(value))}>
                      <SelectTrigger required isLoading={isPending} label="Data Source" error={errors.dataSourceId?.message}>
                        <SelectValue placeholder="Select data source">{selected?.tagTitle}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {dataSourceItems?.map(item => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.tagTitle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
              />
              <DownstreamPicker
                items={downstreamItems}
                selected={selectedDownstreams}
                onToggle={toggleDownstream}
                isLoading={isPending}
                required
                error={selectedDownstreams.length === 0 ? "Please select at least one impacted downstream" : undefined}
              />
              </div>
            </FormSection>

            <FormSection step={3} title="Source & target" description="Where the file lives and is picked up, and where passing and failing rows are written.">

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Controller
                name="fileAvailableOn"
                control={control}
                rules={{ required: "Please select file availability" }}
                render={({ field }) => {
                  const selected = fileAvailableOnOptions.find(item => item.value === field.value);

                  return (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger label="File Available On" required error={errors.fileAvailableOn?.message}>
                        <SelectValue placeholder="Select file storage">{selected?.label}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {fileAvailableOnOptions.map(item => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
              />

              <Controller
                name="sourceFileType"
                control={control}
                rules={{ required: "Please select file type" }}
                render={({ field }) => {
                  const selected = fileTypes.find(item => item.value === field.value);

                  return (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger label="Source File Type" required error={errors.sourceFileType?.message}>
                        <SelectValue placeholder="Select file type">{selected?.label}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {fileTypes.map(item => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
              />
            </div>

            {isAwsS3 && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Controller
                    name="sourceConnectionId"
                    control={control}
                    rules={{
                      validate: value => {
                        if (!isAwsS3) return true;
                        return !!value || "Please select a source file connection";
                      },
                    }}
                    render={({ field }) => {
                      const selected = activeFileConnections.find(
                        (item: any) => String(item.connectionId) === String(field.value)
                      );

                      return (
                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                          <SelectTrigger label="Source Connection" required error={errors.sourceConnectionId?.message}>
                            <SelectValue placeholder="Select source file connection">
                              {selected?.connectionName || selected?.connectionId}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {activeFileConnections.map((item: any) => (
                              <SelectItem key={item.connectionId} value={String(item.connectionId)}>
                                {item.connectionName || item.connectionId}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    }}
                  />
                </div>

                {/* Path and file sit beside each other: they are read together, and the
                    connection select above was pushing the file name onto its own row. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2 ">
                    <Input
                      label="Source File Path"
                      required
                      error={errors.sourceFilePath?.message}
                      className="font-mono"
                      placeholder="Eg. /healthcare"
                      {...register("sourceFilePath", {
                        validate: value => {
                          if (!isAwsS3) return true;
                          return !!value?.trim() || "Source file path is required";
                        },
                        onBlur: event => {
                          const split = splitPathAndFile(event.target.value);

                          if (!split) return;

                          setValue("sourceFilePath", split.path, { shouldValidate: true });
                          setValue("sourceFileName", split.file, { shouldValidate: true });

                          toast.success("Split the folder and the file name", {
                            description: `Path ${split.path} - File ${split.file}`,
                          });
                        },
                      })}
                    />
                    <p className="pl-2 text-xs text-muted-foreground mt-1">
                      Folder only, inside the selected S3 bucket. Paste a full key and it is split for you.
                    </p>
                  </div>

                  <div className="space-y-2 ">
                    <Input
                      label="Source File Name"
                      required
                      error={errors.sourceFileName?.message}
                      className="font-mono"
                      placeholder="customer_master"
                      {...register("sourceFileName", {
                        required: "Source file name is required",
                      })}
                    />
                    <p className="pl-2 text-xs text-muted-foreground mt-1">Do not include file extension.</p>
                  </div>
                </div>

                {selectedFileConnection && (
                  <div className="rounded-2xl bg-muted/40 p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <HugeiconsIcon icon={LinkSquare02Icon} size={18} className="text-primary" />
                      <p className="text-sm font-medium text-foreground">Selected Source Connection</p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      <Meta label="Storage Type" value={selectedFileConnection.storageType} />
                      <Meta label="Bucket" value={selectedFileConnection.bucketOrContainerName} />
                      <Meta label="Region" value={selectedFileConnection.region} />
                      <Meta label="Endpoint" value={selectedFileConnection.endpointUrl} />
                    </div>
                  </div>
                )}

                {s3PickupUrl && (
                  <div className="rounded-2xl bg-muted/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      File pickup preview
                    </p>
                    <a
                      href={s3PickupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 text-sm text-foreground break-all">
                      Your file will be picked up from <span className="font-mono text-primary">{s3PickupUrl}</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Controller
                name="targetConnectionId"
                control={control}
                rules={{ required: "Please select a target database connection" }}
                render={({ field }) => {
                  const selected = activeDbConnections.find(
                    (item: any) => String(item.connectionId) === String(field.value)
                  );

                  return (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger label="Target DB Connection" required error={errors.targetConnectionId?.message}>
                        <SelectValue placeholder="Select target DB connection">
                          {selected?.connectionName || selected?.connectionId}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {activeDbConnections.map((db: any) => (
                          <SelectItem key={db.connectionId} value={String(db.connectionId)}>
                            {db.connectionName || db.connectionId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
              />

              <Input
                label="Target Table Prefix"
                required
                error={errors.targetTableNamePrefix?.message}
                className="font-mono"
                placeholder="conformed_"
                {...register("targetTableNamePrefix", {
                  required: "Target table prefix is required",
                })}
              />
            </div>

              {/* Checkbox and name share one compact row, sized to their content, instead of a
                  full-width box with the name field stretched across it. */}
              <div className="flex w-fit max-w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-muted/30 px-4 py-2.5">
                <label className="flex cursor-pointer items-center gap-2" title="Creates a replica of the source table before the conformance output.">
                  <Controller
                    name="createLanding"
                    control={control}
                    render={({ field }) => (
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} className="border border-blue-500" />
                    )}
                  />
                  <span className="text-sm font-medium text-foreground">Create landing table</span>
                </label>

                {createLanding && (
                  <div className="w-64">
                    <Input
                      aria-label="Landing table name"
                      required
                      error={errors.landingTable?.message}
                      className="h-9 font-mono"
                      placeholder="landing_customer_master"
                      {...register("landingTable", { required: "Landing table name is required" })}
                    />
                  </div>
                )}
              </div>
            </FormSection>

            <FormSection step={4} title="Expected schema" description="The columns this file should have.">
              <SchemaSourceChooser
                onFetch={fetchSchemaFromSource}
                isFetching={isGettingSchema}
                canFetch={isAwsS3}
                fetchBlockedReason="Choose S3 as the file location and a source connection first."
                loadedColumns={uploadedColumns.length}
                uploadPanel={
                  <SchemaFileDrop
                    onParsed={onSchemaFileParsed}
                    loadedFileName={uploadedFileName}
                    loadedRowCount={uploadedColumns.length}
                  />
                }
              />
            </FormSection>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" onClick={() => reset()} variant="secondary">
                Cancel
              </Button>

              <Button
                requires="configure"
                isLoading={isGettingSchema}
                type="submit"
                disabled={isGettingSchema || selectedDownstreams.length === 0}>
                Configure Fields
                <HugeiconsIcon icon={ArrowRight02FreeIcons} size={18} />
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default FileBasedCheckPage;

const Meta = ({ label, value }: { label: string; value?: any }) => {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>

      <p className="text-sm font-medium text-foreground truncate" title={String(value || "—")}>
        {value || "—"}
      </p>
    </div>
  );
};

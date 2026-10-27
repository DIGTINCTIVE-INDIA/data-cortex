import { Controller } from "react-hook-form";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { FILE_TYPE_BY_EXTENSION } from "../../utils/QcFileConfigurationUtils";
import { toast } from "sonner";
import { DownstreamPicker } from "../../components/DownstreamPicker";
import { FlowSteps } from "../../components/FlowSteps";
import { FormSection } from "../../components/FormSection";
import { LandingTableField } from "../../components/LandingTableField";

/**
 * Splits a pasted object key into its folder and its file.
 *
 * People paste the whole key ("/healthcare/customer_master.csv") into the path
 * field, which then disagrees with its own label and puts the file name into the
 * pickup URL twice. Returns null when the last segment does not look like a file,
 * so an ordinary folder path is left alone.
 */
const FILE_EXTENSION = /\.([A-Za-z0-9]{1,8})$/;

/**
 * Reads whatever was typed as a file location -- a full path ("s3://bucket/a/b/x.csv",
 * "/a/b/x.csv"), a folder ("a/b"), or just a file ("x.csv") -- into its parts. The file
 * name keeps its extension, because that is the object's real name. A folder always ends
 * in a slash. Either part is null when the input did not carry it.
 */
const parseFileLocation = (raw: string, bucket?: string) => {
  let value = raw.trim().replace(/\\/g, "/");
  const scheme = value.match(/^(s3|https?):\/\/([^/]+)\/?(.*)$/i);
  if (scheme) {
    // s3://bucket/key and https://bucket.s3.../key both carry the bucket before the key.
    value = scheme[3];
  }

  const segments = value.split("/").filter(Boolean);
  if (segments[0] && bucket && segments[0] === bucket && (scheme || segments.length > 1)) segments.shift();

  const last = segments[segments.length - 1];
  const hasFile = !!last && FILE_EXTENSION.test(last);
  const folderSegments = hasFile ? segments.slice(0, -1) : segments;

  return {
    file: hasFile ? last : null,
    folder: folderSegments.length ? `${folderSegments.join("/")}/` : hasFile || value === "/" ? "/" : null,
  };
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
    createLanding,
    fileAvailableOn,
    sourceFileType,
    isAwsS3,
    selectedFileConnection,
    s3PickupUrl,

    onSubmit,
    setValue,
    watch,
  } = useQcFIleConfProvider();

  const targetTablePrefix = watch("targetTableNamePrefix");

  // Path and name accept the same things -- a full path, a folder, or just a file -- and
  // fill in the rest: the other field, and the file type from the extension.
  const applyLocation = (raw: string) => {
    if (!raw.trim()) return;

    const { file, folder } = parseFileLocation(raw, selectedFileConnection?.bucketOrContainerName);

    if (folder !== null) setValue("sourceFilePath", folder, { shouldValidate: true });

    if (file) {
      setValue("sourceFileName", file, { shouldValidate: true });

      const type = FILE_TYPE_BY_EXTENSION[file.match(FILE_EXTENSION)![1].toLowerCase()];
      if (type) setValue("sourceFileType", type, { shouldValidate: true });

      // A .tsv is tab-separated; any other csv is left to be detected from its header.
      if (/\.tsv$/i.test(file)) setValue("sourceFileDelimiter", "tab");
    }
  };


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

            <FormSection>
              <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
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
                rules={{ required: "Please select a workstream" }}
                render={({ field }) => {
                  const selected = workstreamItems.find((item: any) => item.id === field.value);

                  return (
                    <Select
                      value={field.value ? String(field.value) : undefined}
                      onValueChange={value => field.onChange(Number(value))}>
                      <SelectTrigger
                        isLoading={isPending}
                        empty={!isPending && workstreamItems.length === 0}
                        emptyText="No workstreams configured yet"
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
                      <SelectTrigger required isLoading={isPending} empty={!isPending && categoryItems.length === 0} emptyText="No categories configured yet" label="Check Category" error={errors.categoryId?.message}>
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
                      <SelectTrigger required isLoading={isPending} empty={!isPending && (dataSourceItems?.length ?? 0) === 0} emptyText="No data sources configured yet" label="Data Source" error={errors.dataSourceId?.message}>
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

            <FormSection step={2} title="Source & target" description="Where the file lives and is picked up, and where passing and failing rows are written.">
              {/* The source details, then a clear gap, then the target details. Every row holds two
                  fields; none stands alone. */}
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Controller
                    name="sourceConnectionId"
                    control={control}
                    rules={{ required: "Please select a source file connection" }}
                    render={({ field }) => {
                      const selected = activeFileConnections.find(
                        (item: any) => String(item.connectionId) === String(field.value)
                      );

                      return (
                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                          <SelectTrigger
                            label="Source Connection"
                            required
                            empty={activeFileConnections.length === 0}
                            emptyText="No file connections yet"
                            error={errors.sourceConnectionId?.message}>
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

                  {/* Not chosen: it follows from the source connection (S3 is the only storage). */}
                  <Input
                    label="File Available On"
                    hint="Taken from the source connection. Only S3 is supported for now."
                    readOnly
                    tabIndex={-1}
                    className="cursor-default"
                    placeholder="Set by the source connection"
                    value={
                      selectedFileConnection
                        ? (fileAvailableOnOptions.find(item => item.value === selectedFileConnection.storageType)?.label ??
                          String(selectedFileConnection.storageType))
                        : ""
                    }
                    onChange={() => {}}
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Controller
                    name="sourceFileType"
                    control={control}
                    render={({ field }) => {
                      const options = [{ value: "auto", label: "Detect from the file name" }, ...fileTypes];
                      const current = field.value || "auto";

                      return (
                        <Select value={current} onValueChange={value => field.onChange(value === "auto" ? "" : value)}>
                          <SelectTrigger label="Source File Type" hint="Optional. Worked out from the file name when left empty.">
                            <SelectValue>{options.find(item => item.value === current)?.label}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {options.map(item => (
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
                    name="sourceFileDelimiter"
                    control={control}
                    render={({ field }) => {
                      const options = [
                        { value: "auto", label: "Detect from the file" },
                        { value: "comma", label: "Comma ( , )" },
                        { value: "semicolon", label: "Semicolon ( ; )" },
                        { value: "pipe", label: "Pipe ( | )" },
                        { value: "tab", label: "Tab" },
                      ];
                      const current = field.value || "auto";
                      // Only a CSV has a delimiter.
                      const notApplicable = sourceFileType === "excel" || sourceFileType === "json";

                      return (
                        <Select
                          value={current}
                          disabled={notApplicable}
                          onValueChange={value => field.onChange(value === "auto" ? "" : value)}>
                          <SelectTrigger
                            label="Delimiter"
                            hint="Optional. Detected from the file when left empty. Only used for CSV files.">
                            <SelectValue>
                              {notApplicable ? "Not used for this file type" : options.find(item => item.value === current)?.label}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {options.map(item => (
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

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Input
                    label="File Path"
                    required
                    hint="The folder inside the bucket, or the full path to the file. The file name is filled in for you."
                    error={errors.sourceFilePath?.message}
                    className="font-mono"
                    placeholder="Eg. healthcare/  or  healthcare/customers.csv"
                    {...register("sourceFilePath", {
                      validate: value => !!value?.trim() || "File path is required",
                      onBlur: event => applyLocation(event.target.value),
                    })}
                  />

                  <Input
                    label="File Name"
                    required
                    hint="Exactly as it is saved, with its extension. The file type follows from it."
                    error={errors.sourceFileName?.message}
                    className="font-mono"
                    placeholder="customers.csv"
                    {...register("sourceFileName", {
                      required: "File name is required",
                      validate: value =>
                        FILE_EXTENSION.test(value.trim().split("/").pop() ?? "") ||
                        "Include the extension, exactly as the file is saved (for example customers.csv)",
                      onBlur: event => applyLocation(event.target.value),
                    })}
                  />
                </div>

                {selectedFileConnection && (
                  <div className="rounded-2xl bg-muted/40 p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <HugeiconsIcon icon={LinkSquare02Icon} size={18} className="text-primary" />
                      <p className="text-sm font-medium text-foreground">Selected Source Connection</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                      <Meta label="Storage Type" value={selectedFileConnection.storageType} />
                      <Meta label="Bucket" value={selectedFileConnection.bucketOrContainerName} />
                      <Meta label="Region" value={selectedFileConnection.region} />
                      <Meta label="Endpoint" value={selectedFileConnection.endpointUrl} />
                    </div>
                  </div>
                )}

                {s3PickupUrl && (
                  <div className="rounded-2xl bg-muted/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">File pickup preview</p>
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

              <div className="mt-9 space-y-5">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
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
                          <SelectTrigger
                            label="Target DB Connection"
                            required
                            empty={activeDbConnections.length === 0}
                            emptyText="No database connections yet"
                            error={errors.targetConnectionId?.message}>
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
                    hint="The result tables are created as the prefix followed by _err and _valid."
                    error={errors.targetTableNamePrefix?.message}
                    className="font-mono"
                    placeholder="conformed_"
                    ghost={{ typed: targetTablePrefix ?? "", suffix: "_err" }}
                    {...register("targetTableNamePrefix", {
                      required: "Target table prefix is required",
                    })}
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
                      inputProps={register("landingTable", createLanding ? { required: "Landing table name is required" } : undefined)}
                    />
                  )}
                />
              </div>
            </FormSection>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button type="button" onClick={() => reset()} variant="secondary">
                Cancel
              </Button>

              <Button
                requires="configure"
                type="submit"
                disabled={selectedDownstreams.length === 0}>
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

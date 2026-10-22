"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDialog } from "@/hooks/useDialog";
import { useApi } from "@/lib/useApi";
import type {
  ConfiguredFileCheckItem,
  CreateFileQCConfigurationMutationBody,
} from "@/lib/useApi/types/qcConfigurationApis.types";
import { Edit02Icon, XVariableIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  fileAvailableOnOptions,
  fileTypes,
} from "../../qc-configuration/data-conformance/file/context/QcFIleConfProvider";
import { DownstreamPicker } from "../../qc-configuration/components/DownstreamPicker";

type Props = {
  item: ConfiguredFileCheckItem;
  disabled: boolean;
};

type FormValues = Partial<CreateFileQCConfigurationMutationBody>;

const EditFileDialog = ({ item, disabled }: Props) => {
  const { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, open, setOpen } = useDialog();

  const { register, handleSubmit, reset, control, watch, setValue } = useForm<FormValues>();

  const { mutateAsync, isPending } = useApi("PATCH /api/qc-configuration/file-storage/update-check", {
    query: {
      configId: item.configId,
    },
  });

  const { data: libraries } = useApi("GET /api/libraries/qc-tags/all");
  const { data: dbConnections } = useApi("GET /api/db/connections/list");
  const { data: fileConnections } = useApi("GET /api/file-storage/connections/list");

  const workstreamItems = libraries?.data?.workstream || [];
  const categoryItems = libraries?.data?.category ?? [];
  const dataSourceItems = libraries?.data?.dataSource || [];
  const downstreamItems = libraries?.data?.impactedDownstream || [];
  const fileItems = fileConnections?.data?.items || [];

  const [selectedDownstreams, setSelectedDownstreams] = useState<number[]>([]);

  useEffect(() => {
    if (item && open) {
      const downstreams = item.impactedDownstream || [];

      setSelectedDownstreams(downstreams);

      reset({
        checkName: item.configName || "",
        workstreamId: Number(item.workstream) || 0,
        categoryId: Number(item.checkCategory) || 0,
        dataSourceId: Number(item.dataSource) || 0,
        impactedDownstreamIds: downstreams,
        sourceConnectionId: item.sourceConnectionId || "",
        // The only storage supported today; the saved config does not carry it.
        fileAvailableOn: "s3",
        sourceFileName: item.sourceFileName || "",
        sourceFilePath: item.sourceFilePath || "",
        sourceFileType: item.sourceFileType || "csv",
        targetConnectionId: item.targetConnectionId || "",
        targetTableNamePrefix: item.targetTablePrefix || "",
        createLanding: item.landingTable || false,
        landingTable: item.landingTableName || "",
      });
    }
  }, [item, open, reset]);

  const toggleDownstream = (downstreamId: number) => {
    const updated = selectedDownstreams.includes(downstreamId)
      ? selectedDownstreams.filter(id => id !== downstreamId)
      : [...selectedDownstreams, downstreamId];

    setSelectedDownstreams(updated);

    setValue("impactedDownstreamIds", updated);
  };

  const createLanding = watch("createLanding");

  const onSubmit = async (values: FormValues) => {
    try {
      await mutateAsync({
        ...values,
        impactedDownstreamIds: selectedDownstreams,
      });

      toast.success(" File Configuration updated successfully");

      setOpen(false);
    } catch {
      toast.error("Failed to update configuration");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger requires="configure" disabled={disabled}>
          <Button size="icon-sm" variant="ghost" disabled={disabled}>
            <HugeiconsIcon icon={Edit02Icon} size={16} />
          </Button>
        </DialogTrigger>

        <DialogContent className="max-h-[90vh] overflow-hidden rounded-2xl p-0 sm:max-w-4xl">
          <div className="max-h-[90vh] overflow-y-auto p-8">
            <DialogHeader className="mb-8">
              <DialogTitle>Edit File QC Configuration</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Input required label="Check Name" placeholder="Check Name" {...register("checkName")} />

                {/* WORKSTREAM */}

                <Controller
                  name="workstreamId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : undefined}
                      onValueChange={value => field.onChange(Number(value))}>
                      <SelectTrigger required label="Impacted Workstream">
                        <SelectValue placeholder="Select workstream">
                          {workstreamItems.find((item: any) => String(item.id) === String(field.value))?.tagTitle ??
                            (field.value ? `Unavailable (#${field.value})` : "")}
                        </SelectValue>
                      </SelectTrigger>

                      <SelectContent>
                        {workstreamItems.map((item: any) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.tagTitle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />

                {/* CATEGORY */}

                <Controller
                  name="categoryId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : undefined}
                      onValueChange={value => field.onChange(Number(value))}>
                      <SelectTrigger required label="Category">
                        <SelectValue placeholder="Select category">
                          {categoryItems.find((item: any) => String(item.id) === String(field.value))?.tagTitle ??
                            (field.value ? `Unavailable (#${field.value})` : "")}
                        </SelectValue>
                      </SelectTrigger>

                      <SelectContent>
                        {categoryItems.map((item: any) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.tagTitle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />

                {/* DATA SOURCE */}

                <Controller
                  name="dataSourceId"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : undefined}
                      onValueChange={value => field.onChange(Number(value))}>
                      <SelectTrigger required label="Data Source">
                        <SelectValue placeholder="Select data source">
                          {dataSourceItems.find((item: any) => String(item.id) === String(field.value))?.tagTitle ??
                            (field.value ? `Unavailable (#${field.value})` : "")}
                        </SelectValue>
                      </SelectTrigger>

                      <SelectContent>
                        {dataSourceItems.map((item: any) => (
                          <SelectItem key={item.id} value={String(item.id)}>
                            {item.tagTitle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {/* DOWNSTREAM */}

              <DownstreamPicker
                items={downstreamItems}
                selected={selectedDownstreams.map(Number)}
                onToggle={(item: any) => toggleDownstream(Number(item.id))}
              />

              {/* FILE SECTION */}

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Controller
                  name="fileAvailableOn"
                  control={control}
                  render={({ field }) => {
                    const selected = fileAvailableOnOptions.find(item => item.value === field.value);

                    return (
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger label="File Available On" required>
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
                  render={({ field }) => {
                    const selected = fileTypes.find(item => item.value === field.value);
                    return (
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <SelectTrigger required label="Source File Type">
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

              {/* {isAwsS3 && ( */}
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Controller
                    name="sourceConnectionId"
                    control={control}
                    render={({ field }) => {
                      const selected = fileItems.find((item: any) => String(item.connectionId) === String(field.value));

                      return (
                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                          <SelectTrigger required label="Source Connection">
                            <SelectValue placeholder="Select source file connection">
                              {selected?.connectionName || selected?.connectionId || field.value}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {fileConnections?.data?.items?.map((item: any) => (
                              <SelectItem key={item.connectionId} value={String(item.connectionId)}>
                                {item.connectionName || item.connectionId}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    }}
                  />

                  <div className="space-y-2 ">
                    <Input required label="File Path" placeholder="Eg. healthcare/" {...register("sourceFilePath")} />
                    <p className="pl-2 text-xs text-muted-foreground mt-1">
                      The folder inside the selected S3 bucket.
                    </p>
                  </div>

                  <div className="space-y-2 ">
                    <Input
                      required
                      label="File Name"
                      placeholder="customers.csv"
                      {...register("sourceFileName", {
                        required: "Source file name is required",
                      })}
                    />
                    <p className="pl-2 text-xs text-muted-foreground mt-1">Exactly as it is saved, with its extension.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Controller
                    name="targetConnectionId"
                    control={control}
                    render={({ field }) => {
                      const selected = dbConnections?.data?.items?.find(
                        (item: any) => String(item.connectionId) === String(field.value)
                      );

                      return (
                        <Select value={field.value || undefined} onValueChange={field.onChange}>
                          <SelectTrigger label="Target DB Connection" required>
                            <SelectValue placeholder="Select target DB connection">
                              {selected?.connectionName || selected?.connectionId || field.value}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {dbConnections?.data?.items?.map((db: any) => (
                              <SelectItem key={db.connectionId} value={String(db.connectionId)}>
                                {db.connectionName || db.connectionId}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    }}
                  />

                  <Input required label="Target Prefix" placeholder="conformed_" {...register("targetTableNamePrefix")} />
                </div>
              </div>

              {/* LANDING */}

              <div className="rounded-2xl bg-muted/30 p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <Controller
                    name="createLanding"
                    control={control}
                    render={({ field }) => (
                      <Checkbox className="border-blue-500" checked={field.value} onCheckedChange={field.onChange} />
                    )}
                  />

                  <Label>Create Landing Table</Label>
                </div>

                {createLanding && <Input required label="Landing Table Name" {...register("landingTable")} />}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>

                <Button type="submit" disabled={isPending}>
                  {isPending ? "Updating..." : "Update Configuration"}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EditFileDialog;

"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDialog } from "@/hooks/useDialog";
import { useApi } from "@/lib/useApi";
import type {
  ConfiguredDbCheckItem,
  CreateDBQCConfigurationMutationBody,
} from "@/lib/useApi/types/qcConfigurationApis.types";
import { Edit02Icon, XVariableIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { DownstreamPicker } from "../../qc-configuration/components/DownstreamPicker";

type Props = {
  item: ConfiguredDbCheckItem;
  disabled: boolean;
};

type FormValues = Partial<CreateDBQCConfigurationMutationBody>;

const EditDbDialog = ({ item, disabled }: Props) => {
  const { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, open, setOpen } = useDialog();

  const { register, handleSubmit, reset, control, watch, setValue } = useForm<FormValues>();

  const { mutateAsync, isPending } = useApi("PATCH /api/qc-configuration/db/update-check", {
    query: {
      configId: item.configId,
    },
  });

  const { data: libraries } = useApi("GET /api/libraries/qc-tags/all");
  const { data: dbConnections } = useApi("GET /api/db/connections/list");

  const workstreamItems = libraries?.data?.workstream || [];
  const categoryItems = libraries?.data?.category ?? [];
  const dataSourceItems = libraries?.data?.dataSource || [];
  const downstreamItems = libraries?.data?.impactedDownstream || [];
  const activeDbConnections = (dbConnections?.data?.items ?? []).filter(connection => connection.enabled);

  const [selectedDownstreams, setSelectedDownstreams] = useState<number[]>([]);

  const sourceDbId = watch("sourceDbId");

  const tables = useApi("GET /api/db/connections/tables", {
    query: { connectionId: sourceDbId },
    enabled: !!sourceDbId,
  });

  const selectedDB = activeDbConnections.find((item: any) => String(item.connectionId) === String(sourceDbId));

  const sourceTables = tables.data?.data?.tables ?? [];

  useEffect(() => {
    if (item && open) {
      const downstreams = item.impactedDownstream || [];

      setSelectedDownstreams(downstreams);

      reset({
        checkName: item.configName || "",
        description: "",
        workstreamId: Number(item.workstream) || 0,
        categoryId: Number(item.checkCategory) || 0,
        dataSourceId: Number(item.dataSource) || 0,
        impactedDownstreamIds: downstreams,
        sourceDbId: item.sourceConnectionId || "",
        sourceTableName: item.sourceTableName || "",
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

      toast.success(" DB Configuration updated successfully");

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
              <DialogTitle>Edit DB QC Configuration</DialogTitle>
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
                          {workstreamItems.find((item: any) => String(item.id) === String(field.value))?.tagTitle ?? ""}
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
                          {categoryItems.find((item: any) => String(item.id) === String(field.value))?.tagTitle ?? ""}
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
                          {dataSourceItems.find((item: any) => String(item.id) === String(field.value))?.tagTitle ?? ""}
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

              <Textarea
                label="Description"
                rows={5}
                placeholder="Write a short description..."
                {...register("description")}
              />

              {/* DOWNSTREAM */}

              <DownstreamPicker
                items={downstreamItems}
                selected={selectedDownstreams.map(Number)}
                onToggle={(item: any) => toggleDownstream(Number(item.id))}
              />

              {/* DB SECTION */}

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Controller
                  name="sourceDbId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger required label="Source Database">
                        <SelectValue placeholder="Select source database">
                          {
                            activeDbConnections.find((item: any) => String(item.connectionId) === String(field.value))
                              ?.connectionName
                          }
                        </SelectValue>
                      </SelectTrigger>

                      <SelectContent>
                        {activeDbConnections.map((db: any) => (
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
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger
                        isLoading={tables.isPending && !!sourceDbId}
                        disabled={!sourceDbId}
                        label="Source Table Name"
                        required>
                        <SelectValue placeholder="Select source table">{field.value}</SelectValue>
                      </SelectTrigger>

                      <SelectContent>
                        {sourceTables.map(table => (
                          <SelectItem key={table} value={table}>
                            {table}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />

                <Controller
                  name="targetConnectionId"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger required label="Target Connection">
                        <SelectValue placeholder="Select target connection">
                          {
                            activeDbConnections.find((item: any) => String(item.connectionId) === String(field.value))
                              ?.connectionName
                          }
                        </SelectValue>
                      </SelectTrigger>

                      <SelectContent>
                        {activeDbConnections.map((db: any) => (
                          <SelectItem key={db.connectionId} value={String(db.connectionId)}>
                            {db.connectionName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />

                <Input required label="Target Prefix" placeholder="conformed_" {...register("targetTableNamePrefix")} />
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

export default EditDbDialog;

"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDialog } from "@/hooks/useDialog";
import { useApi } from "@/lib/useApi";
import type { CustomSqlCheckItem } from "@/lib/useApi/types/qcConfigurationApis.types";
import { Edit02Icon, XVariableIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { DownstreamPicker } from "../../qc-configuration/components/DownstreamPicker";

type Props = {
  item: CustomSqlCheckItem;
  disabled: boolean;
};

type FormValues = {
  checkId: string;
  checkDescription?: string | undefined;
  categoryId: number;
  workstreamId: number;
  dataSourceId: number;
  sourceConnectionId: string;
  targetConnectionId: string;
  targetTablePrefix: string;
  checkName: string;
  impactedDownstreamIds: number[];
  sqlQuery: string;
  criticality: string;
};

const EditSqlDialog = ({ item, disabled }: Props) => {
  const { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, open, setOpen } = useDialog();

  const { register, handleSubmit, reset, control, watch, setValue } = useForm<FormValues>();

  const { mutateAsync, isPending } = useApi("PATCH /api/qc-configuration/custom-sql/update-check", {
    query: {
      checkId: item.checkId,
    },
  });

  const { data: libraries } = useApi("GET /api/libraries/qc-tags/all");
  const { data: dbConnections } = useApi("GET /api/db/connections/list");

  const workstreams = libraries?.data?.workstream || [];
  const categoryItems = libraries?.data?.category ?? [];
  const dataSources = libraries?.data?.dataSource || [];
  const downstreams = libraries?.data?.impactedDownstream || [];
  const activeDbConnections = (dbConnections?.data?.items ?? []).filter(connection => connection.enabled);

  const [selectedDownstreams, setSelectedDownstreams] = useState<number[]>([]);

  useEffect(() => {
    if (item && open) {
      const downstreamValues = item.impactedDownstream || [];

      setSelectedDownstreams(downstreamValues);

      reset({
        checkId: item.checkId || "",
        checkName: item.checkName || "",
        checkDescription: item.checkDescription || "",
        categoryId: Number(item.checkCategory) || 0,
        criticality: item.criticality || "",
        workstreamId: Number(item.workstream) || 0,
        dataSourceId: Number(item.dataSource) || 0,
        sourceConnectionId: item.sourceConnectionId || "",
        targetConnectionId: item.targetConnectionId || "",
        targetTablePrefix: item.targetTablePrefix || "",
        sqlQuery: item.sqlQuery || "",
        impactedDownstreamIds: downstreamValues,
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

  const onSubmit = async (values: FormValues) => {
    console.log(values);
    try {
      await mutateAsync({
        ...values,
        impactedDownstreamIds: selectedDownstreams,
      });

      toast.success("SQL Check updated successfully");

      setOpen(false);
    } catch {
      toast.error("Failed to update SQL check");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger requires="configure" disabled={disabled}>
        <Button size="icon-sm" variant="ghost" disabled={disabled}>
          <HugeiconsIcon icon={Edit02Icon} size={16} />
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-hidden rounded-2xl p-0 sm:max-w-4xl">
        <div className="max-h-[90vh] overflow-y-auto p-8">
          <DialogHeader className="mb-8">
            <DialogTitle>Edit SQL Check</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Input required label="Check Name" placeholder="Check Name" {...register("checkName")} />
              <Input label="Check ID" className="font-mono" readOnly {...register("checkId")} />

              <Controller
                name="workstreamId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger required label="Workstream">
                      <SelectValue placeholder="Select workstream">
                        {workstreams.find((item: any) => String(item.id) === String(field.value))?.tagTitle ??
                            (field.value ? `Unavailable (#${field.value})` : "")}
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

              {/* category */}

              <Controller
                name="categoryId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
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

              <Controller
                name="dataSourceId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger required label="Data Source">
                      <SelectValue placeholder="Select source">
                        {dataSources.find((item: any) => String(item.id) === String(field.value))?.tagTitle ??
                            (field.value ? `Unavailable (#${field.value})` : "")}
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

              <Controller
                name="criticality"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger required label="Criticality">
                      <SelectValue placeholder="Select criticality" />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>

                      <SelectItem value="medium">Medium</SelectItem>

                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <Textarea label="Description" rows={4} {...register("checkDescription")} />

            <Textarea required label="SQL Query" rows={8} className="font-mono" {...register("sqlQuery")} />

            <DownstreamPicker
              items={downstreams}
              selected={selectedDownstreams.map(Number)}
              onToggle={(item: any) => toggleDownstream(item.id)}
              required
            />

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Controller
                name="sourceConnectionId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger required label="Source Connection">
                      <SelectValue placeholder="Select source connection">
                        {
                          activeDbConnections.find((item: any) => String(item.connectionId) === String(field.value))
                            ?.connectionName ?? field.value
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
                name="targetConnectionId"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger required label="Target Connection">
                      <SelectValue placeholder="Select target connection">
                        {
                          activeDbConnections.find((item: any) => String(item.connectionId) === String(field.value))
                            ?.connectionName ?? field.value
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

              <Input required label="Target Prefix" placeholder="conformed_" {...register("targetTablePrefix")} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>

              <Button type="submit" disabled={isPending}>
                {isPending ? "Updating..." : "Update SQL Check"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditSqlDialog;

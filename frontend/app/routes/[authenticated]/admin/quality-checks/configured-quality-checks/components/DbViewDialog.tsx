"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedTabs } from "@/components/ui/custom/AnimatedTabs";
import FieldDetails from "./FieldDetails";
import { useDialog } from "@/hooks/useDialog";
import { useApi } from "@/lib/useApi";
import type { ConfiguredDbCheckItem } from "@/lib/useApi/types/qcConfigurationApis.types";
import { Database01Icon, WorkflowSquare09Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

type Props = {
  item: ConfiguredDbCheckItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const DbViewDialog = ({ item, open, onOpenChange }: Props) => {
  const { Dialog, DialogContent, DialogHeader, DialogTitle } = useDialog();
  // Like the creation form: the details first, the fields on the next page.
  const [page, setPage] = useState<"details" | "fields">("details");

  const { data: libraries } = useApi("GET /api/libraries/qc-tags/all");
  const { data: dbConnections } = useApi("GET /api/db/connections/list");

  const workstreams = libraries?.data?.workstream || [];
  const categories = libraries?.data?.category || [];
  const dataSources = libraries?.data?.dataSource || [];
  const downstreams = libraries?.data?.impactedDownstream || [];

  const activeDbConnections = (dbConnections?.data?.items ?? []).filter(connection => connection.enabled);
  const workstream = workstreams.find((ws: any) => String(ws.id) === String(item.workstream));
  const category = categories.find((cat: any) => String(cat.id) === String(item.checkCategory));
  const dataSource = dataSources.find((ds: any) => String(ds.id) === String(item.dataSource));
  const sourceConnection = activeDbConnections.find(
    (conn: any) => String(conn.connectionId) === String(item.sourceConnectionId)
  );
  const targetConnection = activeDbConnections.find(
    (conn: any) => String(conn.connectionId) === String(item.targetConnectionId)
  );

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) setPage("details");
        onOpenChange(next);
      }}>
      <DialogContent className="max-h-[90vh] overflow-hidden rounded-3xl p-0 sm:max-w-4xl">
        <div className="max-h-[90vh] overflow-y-auto p-8">
          <DialogHeader className="mb-8">
            <div className="flex items-start gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <HugeiconsIcon icon={WorkflowSquare09Icon} size={22} />
              </div>

              <div>
                <DialogTitle className="text-xl font-semibold">Database Check Details</DialogTitle>

                <p className="mt-1 text-sm text-muted-foreground">View complete database conformance check details.</p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-8">
            {/* TOP CARD */}
            <div className="rounded-2xl border bg-card p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary">{item.configId}</Badge>
                <h2 className="text-lg font-semibold text-foreground">{item.configName}</h2>

                <Badge>{item.enabled ? "Enabled" : "Active"}</Badge>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                Database conformance configuration details and metadata.
              </p>
            </div>

            {/* TABS */}
            <AnimatedTabs
              value={page}
              btnClassName="min-w-[160px]"
              onValueChange={value => setPage(value as "details" | "fields")}
              tabs={[
                { value: "details", label: "Details" },
                { value: "fields", label: "Fields" },
              ]}
            />

            {page === "details" && (
              <>
            {/* LABELS */}
            <div className="rounded-2xl border bg-card p-6">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Labels</h3>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <InfoCard label="Workstream" value={workstream?.tagTitle} />
                <InfoCard label="Category" value={category?.tagTitle} />
                <InfoCard label="Data Source" value={dataSource?.tagTitle} />
                <InfoCard
                  label="Impacted Downstream"
                  value={
                    <div className="flex flex-wrap gap-2">
                    {item.impactedDownstream?.map(downstreamId => {
                    const downstream = downstreams.find((d: any) => String(d.id) === String(downstreamId));
  
                    return (
                      <Badge key={downstreamId} variant="secondary" className="rounded-xl px-3 py-1">
                        {downstream?.tagTitle || downstreamId}
                      </Badge>
                    );
                  })}
                    </div>
                  }
                />
              </div>
            </div>

            {/* SOURCE AND TARGET */}
            <div className="rounded-2xl border bg-card p-6">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Connection Details</h3>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <InfoCard label="Source Database" value={connectionText(sourceConnection, item.sourceConnectionId)} />
                <InfoCard label="Source Table" value={item.sourceTableName} />
              </div>

              <div className="my-5" />

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <InfoCard label="Target Connection" value={connectionText(targetConnection, item.targetConnectionId)} />
                <InfoCard label="Target Prefix" value={item.targetTablePrefix} />
              </div>
            </div>

            {/* LANDING TABLE */}
            <div className="rounded-2xl border bg-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <HugeiconsIcon icon={Database01Icon} size={18} className="text-primary" />

                <h3 className="text-sm font-semibold text-foreground">Landing Table Details</h3>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <InfoCard label="Landing Enabled" value={item.landingTable ? "Yes" : "No"} />

                <InfoCard label="Landing Table Name" value={item.landingTable ? item.landingTableName : "-"} />
              </div>
            </div>
              </>
            )}

            {page === "fields" && <FieldDetails kind="db" configId={item.configId} />}

            {/* FOOTER */}
            <div className="flex justify-end">
              <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DbViewDialog;


// A connection reads as its id, then its name.
const connectionText = (connection: { connectionName?: string } | undefined, id: string | number) =>
  connection?.connectionName ? `${id} · ${connection.connectionName}` : String(id);

const InfoCard = ({ label, value }: { label: string; value?: React.ReactNode }) => {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>

      <div className="mt-2 text-sm font-medium text-foreground break-words">{value || "N/A"}</div>
    </div>
  );
};

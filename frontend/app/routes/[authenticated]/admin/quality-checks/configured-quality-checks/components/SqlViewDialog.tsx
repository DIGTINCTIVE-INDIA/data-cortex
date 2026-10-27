"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDialog } from "@/hooks/useDialog";
import { useApi } from "@/lib/useApi";
import type { CustomSqlCheckItem } from "@/lib/useApi/types/qcConfigurationApis.types";
import { Database01Icon, SourceCodeCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type Props = {
  item: CustomSqlCheckItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SqlViewDialog = ({ item, open, onOpenChange }: Props) => {
  const { Dialog, DialogContent, DialogHeader, DialogTitle } = useDialog();

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden rounded-3xl p-0 sm:max-w-4xl">
        <div className="max-h-[90vh] overflow-y-auto p-8">
          <DialogHeader className="mb-8">
            <div className="flex items-start gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <HugeiconsIcon icon={SourceCodeCircleIcon} size={22} />
              </div>

              <div>
                <DialogTitle className="text-xl font-semibold">SQL Check Details</DialogTitle>

                <p className="mt-1 text-sm text-muted-foreground">
                  View complete SQL quality check configuration details.
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-8">
            {/* TOP INFO */}
            <div className="rounded-2xl border bg-card p-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-foreground">{item.checkName}</h2>

                <Badge variant="secondary">{item.checkId}</Badge>

                <Badge>{item.criticality}</Badge>

                <Badge variant={item.enabled ? "default" : "destructive"}>
                  {item.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                {item.checkDescription || "No description available"}
              </p>
            </div>

            {/* CONFIG DETAILS */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <InfoCard label="Workstream" value={workstream?.tagTitle} />

              <InfoCard label="Category" value={category?.tagTitle} />

              <InfoCard label="Data Source" value={dataSource?.tagTitle} />

              <InfoCard label="Criticality" value={item.criticality} />

              <InfoCard label="Source Connection" value={connectionText(sourceConnection, item.sourceConnectionId)} />

              <InfoCard label="Target Connection" value={connectionText(targetConnection, item.targetConnectionId)} />

              <InfoCard label="Target Prefix" value={item.targetTablePrefix} />

              <InfoCard label="Status" value={item.enabled ? "Enabled" : "Disabled"} />
            </div>

            {/* IMPACTED DOWNSTREAM */}
            <div className="rounded-2xl border bg-card p-6">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Impacted Downstream</h3>

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
            </div>

            {/* SQL QUERY */}
            <div className="rounded-2xl border bg-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <HugeiconsIcon icon={Database01Icon} size={18} className="text-primary" />

                <h3 className="text-sm font-semibold text-foreground">SQL Query</h3>
              </div>

              <div className="overflow-x-auto rounded-2xl bg-muted/50 p-4">
                <pre className="whitespace-pre-wrap break-words font-mono text-sm text-foreground">{item.sqlQuery}</pre>
              </div>
            </div>

            {/* ERROR MESSAGE */}
            {item.errorMessage && (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6">
                <h3 className="mb-2 text-sm font-semibold text-destructive">Error Message</h3>

                <p className="text-sm text-destructive/80">{item.errorMessage}</p>
              </div>
            )}

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

export default SqlViewDialog;


// A connection reads as its id, then its name.
const connectionText = (connection: { connectionName?: string } | undefined, id: string | number) =>
  connection?.connectionName ? `${id} · ${connection.connectionName}` : String(id);

const InfoCard = ({ label, value }: { label: string; value?: React.ReactNode }) => {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>

      <p className="mt-2 text-sm font-medium text-foreground">{value || "N/A"}</p>
    </div>
  );
};

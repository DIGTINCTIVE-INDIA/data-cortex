"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDialog } from "@/hooks/useDialog";
import { useApi } from "@/lib/useApi";
import type { ConfiguredFileCheckItem } from "@/lib/useApi/types/qcConfigurationApis.types";
import { Database01Icon, EyeIcon, WorkflowSquare09Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type Props = {
  item: ConfiguredFileCheckItem;
  disabled: boolean;
};

const FileViewDialog = ({ item, disabled }: Props) => {
  const { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, open, setOpen } = useDialog();

  const { data: libraries } = useApi("GET /api/libraries/qc-tags/all");
  const { data: fileConnections } = useApi("GET /api/file-storage/connections/list");
  const { data: dbConnections } = useApi("GET /api/db/connections/list");

  const workstreams = libraries?.data?.workstream || [];
  const categories = libraries?.data?.category || [];
  const dataSources = libraries?.data?.dataSource || [];
  const downstreams = libraries?.data?.impactedDownstream || [];
  const activeFileConnections = (fileConnections?.data?.items ?? []).filter(connection => connection.enabled);
  const activeDbConnections = (dbConnections?.data?.items ?? []).filter(connection => connection.enabled);

  const workstream = workstreams.find((ws: any) => String(ws.id) === String(item.workstream));
  const category = categories.find((cat: any) => String(cat.id) === String(item.checkCategory));
  const dataSource = dataSources.find((ds: any) => String(ds.id) === String(item.dataSource));
  const sourceConnection = activeFileConnections.find(
    (conn: any) => String(conn.connectionId) === String(item.sourceConnectionId)
  );
  const targetConnection = activeDbConnections.find(
    (conn: any) => String(conn.connectionId) === String(item.targetConnectionId)
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger disabled={disabled}>
        <Button variant="outline" className="h-9 rounded-xl" disabled={disabled}>
          <HugeiconsIcon icon={EyeIcon} size={16} />
          View Details
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-hidden rounded-3xl p-0 sm:max-w-4xl">
        <div className="max-h-[90vh] overflow-y-auto p-8">
          <DialogHeader className="mb-8">
            <div className="flex items-start gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <HugeiconsIcon icon={WorkflowSquare09Icon} size={22} />
              </div>

              <div>
                <DialogTitle className="text-xl font-semibold">File Storage Check Details</DialogTitle>

                <p className="mt-1 text-sm text-muted-foreground">
                  View complete file storage conformance check details.
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-8">
            {/* TOP CARD */}
            <div className="rounded-2xl border bg-card p-6">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold text-foreground">{item.configName}</h2>

                <Badge variant="secondary">{item.configId}</Badge>

                <Badge>{item.enabled ? "Enabled" : "Active"}</Badge>
              </div>

              <p className="mt-4 text-sm text-muted-foreground">
                File storage conformance configuration details and metadata.
              </p>
            </div>

            {/* CONFIG DETAILS */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <InfoCard label="Workstream" value={workstream?.tagTitle} />

              <InfoCard label="Category" value={category?.tagTitle} />

              <InfoCard label="Data Source" value={dataSource?.tagTitle} />

              <InfoCard label="Source Connection" value={sourceConnection?.connectionName} />
              <InfoCard label="Source File Type" value={item.sourceFileType || "-"} />
              <InfoCard label="Source File Name" value={item.sourceFileName || "-"} />
              <InfoCard label="Source File Path" value={item.sourceFilePath || "-"} />

              <InfoCard label="Target Connection" value={targetConnection?.connectionName} />

              <InfoCard label="Target Prefix" value={item.targetTablePrefix} />
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

            {/* LANDING TABLE */}
            <div className="rounded-2xl border bg-card p-6">
              <div className="mb-4 flex items-center gap-2">
                <HugeiconsIcon icon={Database01Icon} size={18} className="text-primary" />

                <h3 className="text-sm font-semibold text-foreground">Landing Table Details</h3>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <InfoCard label="Landing Enabled" value={item.landingTable ? "Yes" : "No"} />

                <InfoCard label="Landing Table Name" value={item.landingTable ? item.landingTableName || "-" : "-"} />
              </div>
            </div>

            {/* FOOTER */}
            <div className="flex justify-end">
              <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FileViewDialog;

const InfoCard = ({ label, value }: { label: string; value?: string | boolean }) => {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>

      <p className="mt-2 text-sm font-medium text-foreground break-words">{value || "N/A"}</p>
    </div>
  );
};

"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDialog } from "@/hooks/useDialog";
import type { DBConnectionItem, FileConnectionItem } from "@/lib/useApi/types/connectionApis.types";
import { CloudIcon, DatabaseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

/**
 * Read-only details of a connection, in the order the connection is created in. Secrets (the
 * password, the key, the secret access key) are never returned to the page, so are never shown.
 */

type Props<T> = {
  item: T;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const DB_TYPE_LABEL: Record<string, string> = { postgres: "PostgreSQL", snowflake: "Snowflake" };

export const DbConnectionViewDialog = ({ item, open, onOpenChange }: Props<DBConnectionItem>) => {
  const extra = (item.additionalParams ?? {}) as Record<string, unknown>;
  const isSnowflake = item.databaseType === "snowflake";

  // The same order as the form: PostgreSQL asks for host and port, Snowflake for account and
  // warehouse; both then database, schema and username, and Snowflake ends with its role.
  const rows: [string, ReactNode][] = [
    ["Database Type", DB_TYPE_LABEL[item.databaseType] ?? item.databaseType],
    ["Connection Name", item.connectionName],
    ...(isSnowflake
      ? ([
          ["Account Identifier", item.host],
          ["Warehouse", extra.warehouse as string],
          ["Database", item.databaseName],
          ["Schema", item.dbSchema],
          ["Username", item.username],
          ["Role", extra.role as string],
        ] as [string, ReactNode][])
      : ([
          ["Host", item.host],
          ["Port", item.port],
          ["Database", item.databaseName],
          ["Username", item.username],
          ["Schema", item.dbSchema],
          ["SSL", extra.ssl === undefined ? undefined : extra.ssl ? "On" : "Off"],
        ] as [string, ReactNode][])),
  ];

  return (
    <ConnectionDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={DatabaseIcon}
      title="Database Connection Details"
      id={item.connectionId}
      name={item.connectionName}
      enabled={item.enabled}
      rows={rows}
    />
  );
};

export const FileConnectionViewDialog = ({ item, open, onOpenChange }: Props<FileConnectionItem & { enabled?: boolean }>) => {
  const rows: [string, ReactNode][] = [
    ["Configuration Name", item.connectionName],
    ["Storage Type", item.storageType === "s3" ? "AWS S3" : item.storageType],
    ["Bucket Name", item.bucketOrContainerName],
    ["Region", item.region],
    ["Access Key ID", item.accessKeyId],
    ["Endpoint URL", item.endpointUrl],
  ];

  return (
    <ConnectionDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={CloudIcon}
      title="File Storage Connection Details"
      id={item.connectionId}
      name={item.connectionName}
      enabled={item.enabled}
      rows={rows}
    />
  );
};

const ConnectionDialog = ({
  open,
  onOpenChange,
  icon,
  title,
  id,
  name,
  enabled,
  rows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: typeof DatabaseIcon;
  title: string;
  id: string;
  name: string;
  enabled?: boolean;
  rows: [string, ReactNode][];
}) => {
  const { Dialog, DialogContent, DialogHeader, DialogTitle } = useDialog();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden rounded-3xl p-0 sm:max-w-3xl">
        <div className="max-h-[90vh] overflow-y-auto p-8">
          <DialogHeader className="mb-8">
            <div className="flex items-start gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <HugeiconsIcon icon={icon} size={22} />
              </div>

              <div>
                <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
                <p className="mt-1 text-sm text-muted-foreground">Connection settings, as they were created.</p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-8">
            <div className="rounded-2xl border bg-card p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary">{id}</Badge>
                <h2 className="text-lg font-semibold text-foreground">{name}</h2>
                <Badge>{enabled === false ? "Disabled" : "Enabled"}</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {rows.map(([label, value]) => (
                <div key={label} className="rounded-2xl border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>

                  <div className="mt-2 break-words text-sm font-medium text-foreground">
                    {value === undefined || value === null || value === "" ? "-" : value}
                  </div>
                </div>
              ))}
            </div>

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

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { QcAlertItems } from "@/lib/useApi/types/qcAlerts.types";

/**
 * Checks answered by the table definition alone, so there is no row count.
 *
 * TC002 (column names) and TC003 (column order) are one information_schema query
 * each -- they never read a row, so "Records Affected" is wrong for them.
 *
 * TC004 (data types) is NOT in this set: it scans the values, so its number is a
 * real count of rows that do not fit the declared type.
 */
const SCHEMA_LEVEL_CHECKS = new Set(["TC002", "TC003"]);

export const isSchemaLevelCheck = (checkId: string) => SCHEMA_LEVEL_CHECKS.has(checkId?.toUpperCase?.() ?? "");

/** "Records Affected" is meaningless for a check that never looked at a record. */
/**
 * results.issue_rows and passed_rows are varchar, and the engine writes the
 * string "NA" when it has no count. Number("NA") is NaN, which rendered as the
 * literal text "NaN" on every alert. Anything non-numeric shows as a dash.
 */
export const formatCount = (value: string | number | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "—";
};

export const affectedLabel = (checkId: string) =>
  isSchemaLevelCheck(checkId) ? "Columns Mismatched" : "Records Affected";

/**
 * Both outcomes take a note, and the only difference is whether it is required.
 *
 * Discard demands one: it leaves bad data in place, so it has to be accountable.
 * Resolve accepts one: the fix is usually obvious, but "corrected at source,
 * reloaded 14 Oct" is worth keeping when someone takes the trouble to write it.
 *
 * A note shorter than 3 characters is rejected in both modes -- an optional
 * field means you may leave it empty, not that "x" is a reason.
 */
const STATUS_COPY = {
  resolved: {
    title: "Mark this issue resolved",
    blurb: "Resolving records that the data was corrected. A note is optional.",
    label: "Note (optional)",
    placeholder: "e.g. Corrected at source and reloaded on 14 Oct",
    confirm: "Mark Resolved",
    pending: "Resolving...",
    confirmClass: "bg-success text-white hover:bg-success/90",
  },
  discarded: {
    title: "Discard this issue",
    blurb: "Discarding leaves the data as it is, so the reason is recorded against the alert.",
    label: "Reason",
    placeholder: "e.g. Known upstream backfill, corrected at source on 12 Oct",
    confirm: "Discard Issue",
    pending: "Discarding...",
    confirmClass: "bg-destructive text-white hover:bg-destructive/90",
  },
} as const;

export function AlertStatusDialog({
  alert,
  status,
  onClose,
  onConfirm,
  isPending,
}: {
  alert: QcAlertItems | null;
  status: "resolved" | "discarded";
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void>;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");

  const copy = STATUS_COPY[status];
  const reasonRequired = status === "discarded";

  const trimmed = reason.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 3;
  const blocked = reasonRequired ? trimmed.length < 3 : tooShort;

  const submit = async () => {
    if (reasonRequired && trimmed.length < 3) {
      toast.error("A reason is required", { description: "At least 3 characters." });
      return;
    }

    if (tooShort) {
      toast.error("That note is too short", { description: "Use at least 3 characters, or leave it empty." });
      return;
    }

    // Empty stays undefined rather than "", so the API records no note at all.
    await onConfirm(trimmed.length > 0 ? trimmed : undefined);
    setReason("");
  };

  return (
    <Dialog
      open={Boolean(alert)}
      onOpenChange={value => {
        if (!value) {
          setReason("");
          onClose();
        }
      }}>
      <DialogContent className="sm:max-w-lg rounded-3xl border-border/50 bg-card">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-foreground">{copy.title}</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">{copy.blurb}</p>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm text-foreground">{alert?.title}</p>

          <Textarea
            label={copy.label}
            required={reasonRequired}
            rows={4}
            autoFocus
            value={reason}
            onChange={event => setReason(event.target.value)}
            placeholder={copy.placeholder}
            error={tooShort ? "At least 3 characters" : undefined}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" className="h-10 rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || blocked} className={cn("h-10 rounded-xl", copy.confirmClass)}>
            {isPending ? copy.pending : copy.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AlertDetailsDialog({ alert, onClose }: { alert: QcAlertItems | null; onClose: () => void }) {
  if (!alert) return null;

  const schemaLevel = isSchemaLevelCheck(alert.checkId);

  return (
    <Dialog open={Boolean(alert)} onOpenChange={value => !value && onClose()}>
      <DialogContent className="w-[min(860px,calc(100vw-32px))] sm:max-w-none rounded-3xl border-border/50 bg-card">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">{alert.title}</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {alert.checkId} · {alert.configName} ({alert.configId})
          </p>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-muted text-foreground">{alert.checkType}</Badge>
            <Badge className="bg-muted text-foreground">{alert.criticality}</Badge>
            <Badge className="bg-muted text-foreground">{alert.checkStatus}</Badge>
            {alert.abort && <Badge className="bg-destructive/10 text-destructive">aborts the job</Badge>}
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Detail label="Table / File" value={alert.fileOrTableName} />
            <Detail label="Field" value={alert.field || "— (table-level check)"} />
            <Detail label="Workstream" value={alert.workstream} />
            <Detail label="Category" value={alert.category} />
            <Detail label="Source" value={alert.source} />
            <Detail label="Impacted Downstream" value={alert.impactedDownstream?.join(", ")} />
            <Detail label={affectedLabel(alert.checkId)} value={formatCount(alert.recordsAffected)} />
            {/* Passed rows is only meaningful when the check actually read rows. */}
            {!schemaLevel && <Detail label="Passed Rows" value={formatCount(alert.passedRows)} />}
            <Detail label="Job" value={alert.jobId} />
            <Detail label="Run At" value={alert.jobTimestamp ? new Date(alert.jobTimestamp).toLocaleString() : "—"} />
          </div>

          {alert.failureReason && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Failure Reason</p>
              <p className="mt-1 rounded-xl bg-muted/50 px-3 py-2 text-sm text-foreground">{alert.failureReason}</p>
            </div>
          )}

          {/* A resolve may carry a note too, so it is shown on the same footing
              as a discard reason -- tinted to match the outcome it explains. */}
          {alert.issueStatusReason && (alert.issueStatus === "discarded" || alert.issueStatus === "resolved") && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {alert.issueStatus === "discarded" ? "Discarded Because" : "Resolution Note"}
              </p>
              <p
                className={cn(
                  "mt-1 rounded-xl px-3 py-2 text-sm text-foreground ring-1",
                  alert.issueStatus === "discarded"
                    ? "bg-destructive/5 ring-destructive/20"
                    : "bg-success/5 ring-success/20"
                )}>
                {alert.issueStatusReason}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" className="h-10 rounded-xl" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground break-words" title={value ?? "—"}>
        {value || "—"}
      </p>
    </div>
  );
}

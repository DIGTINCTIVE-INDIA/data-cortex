"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/contexts/AuthContext";
import { useApi } from "@/lib/useApi";
import type { JobCheckResult, JobDetail, JobItem, JobStatus } from "@/lib/useApi/types/jobsApis.types";
import { cn } from "@/lib/utils";

import { useLiveClock } from "./useLiveClock";

const FILTERS: { label: string; value: JobStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Held", value: "held" },
  { label: "Queued", value: "queued" },
  { label: "Running", value: "running" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
];

const STATUS_STYLE: Record<JobStatus, string> = {
  held: "bg-warning/10 text-warning",
  queued: "bg-muted text-muted-foreground",
  running: "bg-info/10 text-info",
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
};

/**
 * How often unfinished jobs are re-checked. Finished jobs are never re-fetched -- they do
 * not change -- so a page with nothing live makes no requests at all.
 */
const POLL_MS = 10_000;

/** Jobs loaded at once. Filtering happens in the browser over these; only asking for more rows hits the server. */
const PAGE_SIZE = 100;

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

const formatSeconds = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;

/**
 * Elapsed time. A finished job uses the recorded start and finish, so it is a real figure.
 * A live one counts up to `now`, which the page advances locally every second between
 * polls -- an estimate that is replaced by the real number when the job is seen to end.
 * A queued job counts from submission (it has not started); a running one from its start.
 */
const formatDuration = (job: Pick<JobItem, "status" | "startedAt" | "finishedAt" | "submittedAt">, now: number) => {
  const start = new Date(job.startedAt ?? job.submittedAt).getTime();
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : now;

  return formatSeconds(Math.max(0, Math.round((end - start) / 1000)));
};

const isLive = (status: JobStatus) => status === "queued" || status === "running";

export default function JobsPage() {
  const role = useAuthStore(state => state.auth.session?.role);
  const isAdmin = role === "admin";

  const [filter, setFilter] = useState<JobStatus | "all">("all");
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  // No status in the query: the filter chips narrow what is already here instead of
  // asking the server again. The only reason to ask again is to load more rows.
  const { data, isLoading, isError, refetch } = useApi("GET /api/jobs", { query: { limit } });

  const jobs = useMemo<JobItem[]>(() => data?.data?.items ?? [], [data]);
  const total = (data?.data as { pagination?: { total?: number } } | undefined)?.pagination?.total ?? jobs.length;
  const hasMore = jobs.length < total;

  const visibleJobs = useMemo(
    () => (filter === "all" ? jobs : jobs.filter(job => job.status === filter)),
    [jobs, filter]
  );

  const countFor = (value: JobStatus | "all") =>
    value === "all" ? jobs.length : jobs.filter(job => job.status === value).length;

  // If the selected category empties (its last running job finished, say), its chip disappears;
  // fall back to All rather than leave an empty list with nothing highlighted.
  useEffect(() => {
    if (!isLoading && filter !== "all" && !jobs.some(job => job.status === filter)) setFilter("all");
  }, [jobs, filter, isLoading]);

  // "Live" is judged over everything loaded, not just what the filter shows -- a running
  // job hidden behind the Completed chip still has to be noticed when it finishes.
  const anyLive = jobs.some(job => isLive(job.status));
  const now = useLiveClock(anyLive);

  // Only unfinished work is polled, and not at all while the tab is in the background.
  useEffect(() => {
    if (!anyLive) return;

    const timer = setInterval(() => {
      if (!document.hidden) void refetch();
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [anyLive, refetch]);

  // A job that was live and is now finished has just had its estimate replaced by the
  // real duration. Flag it briefly so the change reads as a correction, not a glitch.
  const previous = useRef<Map<string, JobStatus>>(new Map());
  const [settled, setSettled] = useState<Set<string>>(new Set());

  useEffect(() => {
    const justFinished = jobs.filter(job => {
      const before = previous.current.get(job.runId);
      return !isLive(job.status) && before !== undefined && isLive(before);
    });

    previous.current = new Map(jobs.map(job => [job.runId, job.status]));

    if (justFinished.length === 0) return;

    setSettled(prev => new Set([...prev, ...justFinished.map(job => job.runId)]));

    const timer = setTimeout(() => setSettled(new Set()), 2000);
    return () => clearTimeout(timer);
  }, [jobs]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description={
          isAdmin
            ? "Every check run, whoever started it."
            : "The check runs you started. Administrators can see everyone's."
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {/* A category appears only while at least one job is in it ("All" always does), so there is
            never a chip that leads to an empty list. */}
        {FILTERS.filter(item => item.value === "all" || countFor(item.value) > 0).map(item => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition",
              filter === item.value
                ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                : "bg-background text-muted-foreground ring-1 ring-border/60 hover:text-foreground"
            )}>
            {item.label} <span className="ml-1 opacity-60">{countFor(item.value)}</span>
          </button>
        ))}

        {anyLive && (
          <span className="ml-2 text-xs text-muted-foreground"></span>
        )}
      </div>

      <div className="rounded-3xl bg-muted/25 p-2">
        <div className="overflow-x-auto rounded-[22px] bg-card p-2 shadow-soft ring-1 ring-border/50">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Check</th>
                {isAdmin && <th className="px-4 py-3 font-medium">Started By</th>}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" title="Each rule on a column is one check; a custom check is one check.">
                  Checks
                </th>
                <th className="px-4 py-3 font-medium" title="Rows of the table. A row that fails several checks counts once.">
                  Rows
                </th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Duration</th>
              </tr>
            </thead>

            <tbody>
              {isLoading && <StateRow span={isAdmin ? 7 : 6}>Loading jobs...</StateRow>}
              {isError && !isLoading && <StateRow span={isAdmin ? 7 : 6}>Could not load jobs.</StateRow>}
              {!isLoading && !isError && visibleJobs.length === 0 && (
                <StateRow span={isAdmin ? 7 : 6}>
                  {filter === "all" ? "No jobs yet. Run a check from Configured Checks." : `No ${filter} jobs.`}
                </StateRow>
              )}

              {visibleJobs.map(job => (
                <tr
                  key={job.runId}
                  onClick={() => setOpenRunId(job.runId)}
                  className="cursor-pointer border-t border-border/40 hover:bg-muted/20">
                  {/* A fixed ceiling, so one very long name cannot stretch the whole column; the full
                      name is still in the tooltip. */}
                  <td className="max-w-[360px] px-4 py-3">
                    <p className="truncate font-semibold text-foreground" title={job.configName ?? job.configId}>
                      {job.configName ?? job.configId}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {job.configId} · {job.runId.slice(0, 8)}
                    </p>
                  </td>

                  {isAdmin && (
                    <td className="px-4 py-3 text-foreground">
                      {job.startedBy?.fullName ?? "—"}
                      {job.startedBy?.role === "service" && (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          service
                        </span>
                      )}
                      {/* Which credential, not just which identity: an identity can hold several. */}
                      {job.startedWithKey && (
                        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">via {job.startedWithKey}</p>
                      )}
                    </td>
                  )}

                  <td className="px-4 py-3">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-3">
                    <CheckCounts job={job} />
                  </td>
                  <td className="px-4 py-3">
                    <RowCounts job={job} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(job.submittedAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    <span className={cn("inline-block px-1", settled.has(job.runId) && "dc-settle")}>
                      {formatDuration(job, now)}
                      {isLive(job.status) && <span className="ml-1 text-xs opacity-60">so far</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" className="rounded-xl" onClick={() => setLimit(value => value + PAGE_SIZE)}>
            Load more ({total - jobs.length} older)
          </Button>
        </div>
      )}

      <JobDetailDialog runId={openRunId} isAdmin={isAdmin} onClose={() => setOpenRunId(null)} />
    </div>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", STATUS_STYLE[status])}>
      {/* Queued counts as live too -- it used to look as settled as "completed". */}
      {isLive(status) && <span className="dc-live-dot" />}
      {status}
    </span>
  );
}

function CheckCounts({ job }: { job: JobItem }) {
  const { passed, failed, error, upstream_failed } = job.checks;
  const total = passed + failed + error + upstream_failed;

  if (job.status === "held") return <span className="text-xs text-muted-foreground">Waiting for the engine</span>;
  if (isLive(job.status)) return <span className="text-muted-foreground">—</span>;
  if (total === 0) return <span className="text-muted-foreground">No results</span>;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
      <span className="font-medium text-muted-foreground">
        {total} {total === 1 ? "check" : "checks"}
      </span>
      <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">{passed} passed</span>
      {failed > 0 && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{failed} failed</span>}
      {error > 0 && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">{error} error</span>}
      {upstream_failed > 0 && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{upstream_failed} not run</span>
      )}
    </div>
  );
}

/**
 * What the run did to the DATA: out of this many rows, this many different rows failed at least
 * one check. Not the same number as the failed checks beside it -- one bad row can fail several
 * checks, and one check can fail many rows.
 */
function RowCounts({ job }: { job: JobItem }) {
  const { total, failed, clean } = job.rows ?? { total: null, failed: null, clean: null };

  if (isLive(job.status) || job.status === "held") return <span className="text-muted-foreground">—</span>;

  if (total === null || failed === null || clean === null) {
    return (
      <span className="text-muted-foreground" title="No row counts were recorded for this run. Open it to see why.">
        —
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
      <span className="font-medium tabular-nums text-muted-foreground">{total.toLocaleString()} rows</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 tabular-nums",
          failed > 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
        )}>
        {failed.toLocaleString()} failed
      </span>
      <span className="rounded-full bg-success/10 px-2 py-0.5 tabular-nums text-success">{clean.toLocaleString()} passed</span>
    </div>
  );
}

function StateRow({ children, span }: { children: React.ReactNode; span: number }) {
  return (
    <tr>
      <td colSpan={span} className="px-4 py-10 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

function JobDetailDialog({ runId, isAdmin, onClose }: { runId: string | null; isAdmin: boolean; onClose: () => void }) {
  const { data, isLoading, isError, refetch } = useApi("GET /api/jobs/:runId", {
    enabled: Boolean(runId),
    params: { runId: runId ?? "" },
  });

  const job = data?.data?.job;
  const live = Boolean(job && isLive(job.status));
  const now = useLiveClock(live);

  useEffect(() => {
    if (!runId || !live) return;

    const timer = setInterval(() => {
      if (!document.hidden) void refetch();
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [runId, live, refetch]);

  return (
    <Dialog open={Boolean(runId)} onOpenChange={value => !value && onClose()}>
      <DialogContent className="max-h-[90vh] w-[min(920px,calc(100vw-32px))] overflow-y-auto sm:max-w-none rounded-3xl border-border/50 bg-card">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">
            {job ? (job.configName ?? job.configId) : "Job"}
          </DialogTitle>
          {job && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {job.configId} · run {job.runId}
            </p>
          )}
        </DialogHeader>

        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>}
        {isError && !isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Could not load this job.</p>}

        {job && (
          <div className="space-y-5 pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={job.status} />
              {job.jobStatus && (
                <span className="text-xs text-muted-foreground">
                  Overall: <span className="font-semibold text-foreground">{job.jobStatus}</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Detail label="Source" value={job.source} />
              {isAdmin && <Detail label="Started By" value={job.startedBy?.fullName ?? "—"} />}
              <Detail label="Submitted" value={formatDate(job.submittedAt)} />
              <Detail label="Started" value={formatDate(job.startedAt)} />
              <Detail label="Finished" value={formatDate(job.finishedAt)} />
              <Detail label="Duration" value={`${formatDuration(job, now)}${live ? " so far" : ""}`} />
            </div>

            {job.status === "held" && (
              <div className="rounded-xl bg-warning/5 p-3 ring-1 ring-warning/30">
                <p className="text-[11px] font-medium uppercase tracking-wide text-warning">Held</p>
                <p className="mt-1 text-sm font-semibold text-foreground">Waiting for the engine</p>
                <p className="mt-0.5 text-sm text-foreground/90">
                  The engine was not available when this was started. It is kept safely and goes to the engine by itself as
                  soon as the engine says it is up. Nothing needs to be done.
                </p>
                {job.lastDispatchError && (
                  <p className="mt-2 break-words font-mono text-xs text-muted-foreground" title={job.lastDispatchError}>
                    Last reason: {job.lastDispatchError.slice(0, 240)}
                  </p>
                )}
              </div>
            )}

            {job.error && <JobFailure job={job} />}

            {!isLive(job.status) && job.results.length > 0 && <RunSummary job={job} />}

            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Checks ({job.results.length})
              </p>

              {job.results.length === 0 ? (
                <p className="rounded-xl bg-muted/40 px-3 py-4 text-center text-sm text-muted-foreground">
                  {isLive(job.status) ? "Results appear here as the job finishes." : "This job wrote no results."}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl ring-1 ring-border/50">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Check</th>
                        <th className="px-3 py-2 font-medium">Field</th>
                        <th className="px-3 py-2 font-medium">Result</th>
                        <th className="px-3 py-2 font-medium" title="Rows that failed this one check">
                          Rows failing
                        </th>
                        <th className="px-3 py-2 font-medium">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {job.results.map(result => (
                        <ResultRow key={result.checkExecutionId} result={result} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" className="h-10 rounded-xl" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const RESULT_STYLE: Record<JobCheckResult["checkStatus"], string> = {
  passed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
  error: "bg-warning/10 text-warning",
  upstream_failed: "bg-muted text-muted-foreground",
};

function ResultRow({ result }: { result: JobCheckResult }) {
  return (
    <tr className="border-t border-border/40 align-top">
      <td className="px-3 py-2">
        <p className="font-medium text-foreground">{result.checkName}</p>
        <p className="font-mono text-xs text-muted-foreground">{result.checkId}</p>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{result.field ?? "—"}</td>
      <td className="px-3 py-2">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", RESULT_STYLE[result.checkStatus])}>
          {result.checkStatus === "upstream_failed" ? "not run" : result.checkStatus}
        </span>
      </td>
      <td className="px-3 py-2 tabular-nums text-muted-foreground">
        {/* Only checks that look at rows have a count; "NA" and a missing count mean none. */}
        {/^\d+$/.test(result.issueRows) ? Number(result.issueRows).toLocaleString() : "—"}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {result.checkStatus === "passed" ? "—" : (result.failureReason ?? "—")}
      </td>
    </tr>
  );
}

/**
 * Why the JOB failed (not a check): a plain title and reason for the business reader, and the
 * raw error behind an expander for the developer. Both have a fixed size -- the reason is cut to
 * three lines and the raw detail scrolls inside a box of fixed height -- so a huge error never
 * stretches the dialog.
 */
function JobFailure({ job }: { job: JobItem }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const detail = job.errorDetail?.trim() || "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${job.errorTitle ?? "Job failed"}\n${job.error ?? ""}\n\n${detail}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the text is still selectable in the box.
    }
  };

  return (
    <div className="rounded-xl bg-destructive/5 p-3 ring-1 ring-destructive/20">
      <p className="text-[11px] font-medium uppercase tracking-wide text-destructive">Job failed</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{job.errorTitle ?? "Job failed"}</p>
      <p className="mt-0.5 line-clamp-3 break-words text-sm text-foreground/90" title={job.error ?? undefined}>
        {job.error}
      </p>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          className="text-xs font-medium text-primary underline-offset-4 hover:underline">
          {open ? "Hide technical details" : "Show technical details"}
        </button>
        {open && detail && (
          <button type="button" onClick={copy} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      {open && (
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-background/80 p-3 font-mono text-xs text-foreground ring-1 ring-border/60">
          {detail || "No technical detail was recorded for this run. Runs that failed before this was added only have the message above."}
        </pre>
      )}
    </div>
  );
}

/** The two separate answers about a finished run: how the checks went, and what happened to the rows. */
/**
 * Says why a run has no row counts, from what the run itself recorded -- never a guess. A mandatory
 * check that fails stops the checks after it and keeps no error rows; a check that errors is
 * named the same way. With neither, the run simply recorded no row counts, and that is all it says.
 */
function rowsUnavailableReason(results: JobCheckResult[]) {
  const named = (ids: string[]) =>
    ids
      .map(id => {
        const found = results.find(result => result.checkId === id);
        return found ? `${found.checkName} (${id})` : id;
      })
      .join(", ");

  // The checks that did not run say which mandatory check stopped them ("TC003 (Column Order) ... required gate").
  const gateIds = [
    ...new Set(
      results
        .filter(result => result.checkStatus === "upstream_failed")
        .flatMap(result => result.failureReason?.match(/\bTC\d+\b/g) ?? [])
    ),
  ];

  if (gateIds.length > 0) {
    const gates = results.filter(result => gateIds.includes(result.checkId));
    const failed = gates.filter(result => result.checkStatus === "failed").map(result => result.checkId);

    if (failed.length > 0) {
      return `Not available. ${named(failed)} is a mandatory check and it failed, so the checks after it did not run and no error rows were kept.`;
    }

    return `Not available. ${named(gateIds)} is a mandatory check and the checks after it did not run, so no error rows were kept.`;
  }

  const errored = results.filter(result => result.checkStatus === "error").map(result => result.checkId);

  if (errored.length > 0) {
    return `Not available. ${named(errored)} ended in an error, so the rows were not evaluated.`;
  }

  return "Not available. This run recorded no row counts.";
}

function RunSummary({ job }: { job: JobDetail }) {
  const { passed, failed, error, upstream_failed } = job.checks;
  const checkTotal = passed + failed + error + upstream_failed;
  const { total, failed: rowsFailed, clean } = job.rows ?? { total: null, failed: null, clean: null };
  const isCustom = job.source === "custom-sql";

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-2xl bg-muted/30 p-4 ring-1 ring-border/50">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Checks</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
          {failed} <span className="text-base font-medium text-muted-foreground">of {checkTotal} failed</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {passed} passed
          {error > 0 && ` · ${error} error`}
          {upstream_failed > 0 && ` · ${upstream_failed} not run`}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {isCustom
            ? "A custom check is one check, whatever its query returns."
            : "One check is one rule on one column, such as Null on column A."}
        </p>
      </div>

      <div className="rounded-2xl bg-muted/30 p-4 ring-1 ring-border/50">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Rows</p>
        {total === null || rowsFailed === null || clean === null ? (
          <p className="mt-1 text-sm text-muted-foreground">{rowsUnavailableReason(job.results)}</p>
        ) : (
          <>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
              {rowsFailed.toLocaleString()}{" "}
              <span className="text-base font-medium text-muted-foreground">of {total.toLocaleString()} rows failed</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{clean.toLocaleString()} passed</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {isCustom
                ? "The rows the query returned, out of the table's rows."
                : "A row that fails several checks counts once, so this can be smaller than the failed checks."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

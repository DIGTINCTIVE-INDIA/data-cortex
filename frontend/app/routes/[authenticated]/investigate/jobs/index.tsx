"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/contexts/AuthContext";
import { useApi } from "@/lib/useApi";
import type { JobCheckResult, JobItem, JobStatus } from "@/lib/useApi/types/jobsApis.types";
import { cn } from "@/lib/utils";

import { useLiveClock } from "./useLiveClock";

const FILTERS: { label: string; value: JobStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Queued", value: "queued" },
  { label: "Running", value: "running" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
];

const STATUS_STYLE: Record<JobStatus, string> = {
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
        {FILTERS.map(item => (
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
          <span className="ml-2 text-xs text-muted-foreground">Unfinished jobs are checked every {POLL_MS / 1000}s</span>
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
                <th className="px-4 py-3 font-medium">Results</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Duration</th>
              </tr>
            </thead>

            <tbody>
              {isLoading && <StateRow span={isAdmin ? 6 : 5}>Loading jobs...</StateRow>}
              {isError && !isLoading && <StateRow span={isAdmin ? 6 : 5}>Could not load jobs.</StateRow>}
              {!isLoading && !isError && visibleJobs.length === 0 && (
                <StateRow span={isAdmin ? 6 : 5}>
                  {filter === "all" ? "No jobs yet. Run a check from Configured Checks." : `No ${filter} jobs.`}
                </StateRow>
              )}

              {visibleJobs.map(job => (
                <tr
                  key={job.runId}
                  onClick={() => setOpenRunId(job.runId)}
                  className="cursor-pointer border-t border-border/40 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{job.configName ?? job.configId}</p>
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

  if (isLive(job.status)) return <span className="text-muted-foreground">—</span>;
  if (total === 0) return <span className="text-muted-foreground">No results</span>;

  return (
    <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
      <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">{passed} passed</span>
      {failed > 0 && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">{failed} failed</span>}
      {error > 0 && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">{error} error</span>}
      {upstream_failed > 0 && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{upstream_failed} not run</span>
      )}
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

            {job.error && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Job Error</p>
                <p className="mt-1 rounded-xl bg-destructive/5 px-3 py-2 text-sm text-foreground ring-1 ring-destructive/20">
                  {job.error}
                </p>
              </div>
            )}

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
      <td className="px-3 py-2 text-muted-foreground">
        {result.checkStatus === "passed" ? "—" : (result.failureReason ?? "—")}
      </td>
    </tr>
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

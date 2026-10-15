"use client";

import React, { useMemo, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/lib/useApi";
import type { DqCheckSource } from "@/lib/useApi/types/librariesApis.types";
import { cn } from "@/lib/utils";

import { Database01Icon, FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const ALL_WORKSTREAMS = "All Workstreams";
const ALL_SOURCES = "All Sources";

/**
 * Turns a timestamp into "12 mins ago".
 *
 * The board previously showed hardcoded strings like "6 hours ago"; this is the
 * same shape computed from results.job_timestamp. Null means the source has
 * configs but has never been run.
 */
const relativeTime = (value: string | null) => {
  if (!value) return "Never run";

  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

export default function DQChecksLibraryPage() {
  const [workstream, setWorkstream] = useState(ALL_WORKSTREAMS);
  const [dataSource, setDataSource] = useState(ALL_SOURCES);

  const { data, isLoading, isError } = useApi("GET /api/libraries/dq-checks/sources");

  const sources = useMemo<DqCheckSource[]>(() => data?.data?.sources ?? [], [data]);

  // Both filter lists come from the data: a hardcoded list goes stale the moment
  // someone adds a tag under Configure Libraries.
  const workstreamOptions = useMemo(() => {
    const names = new Set<string>();
    for (const source of sources) for (const name of source.workstreams) names.add(name);
    return [ALL_WORKSTREAMS, ...[...names].sort()];
  }, [sources]);

  const sourceOptions = useMemo(() => [ALL_SOURCES, ...sources.map(item => item.name)], [sources]);

  const filteredSources = useMemo(() => {
    return sources.filter(source => {
      const byWorkstream = workstream === ALL_WORKSTREAMS || source.workstreams.includes(workstream);
      const bySource = dataSource === ALL_SOURCES || source.name === dataSource;
      return byWorkstream && bySource;
    });
  }, [sources, workstream, dataSource]);

  const totals = useMemo(() => {
    return {
      sources: filteredSources.length,
      totalChecks: filteredSources.reduce((sum, item) => sum + item.checks, 0),
      activeChecks: filteredSources.reduce((sum, item) => sum + item.active, 0),
      failedChecks: filteredSources.reduce((sum, item) => sum + item.failed, 0),
    };
  }, [filteredSources]);

  return (
    <div className="min-h-full bg-background">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">DQ Checks Library</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage and monitor data quality checks across all data sources.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniMetric label="Sources" value={totals.sources} />
            <MiniMetric label="Total Checks" value={totals.totalChecks} />
            <MiniMetric label="Active" value={totals.activeChecks} tone="success" />
            <MiniMetric label="Open Issues" value={totals.failedChecks} tone="warning" />
          </div>
        </div>

        <Panel className="p-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr_1fr] lg:items-center">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <HugeiconsIcon icon={FilterIcon} size={18} />
              Filters
            </div>

            <FilterSelect
              label="Workstream"
              value={workstream}
              items={workstreamOptions}
              onValueChange={setWorkstream}
            />

            <FilterSelect label="Data Source" value={dataSource} items={sourceOptions} onValueChange={setDataSource} />
          </div>
        </Panel>

        {isLoading && <Panel className="p-10 text-center text-sm text-muted-foreground">Loading sources...</Panel>}

        {isError && !isLoading && (
          <Panel className="p-10 text-center text-sm text-muted-foreground">Could not load data sources.</Panel>
        )}

        {!isLoading && !isError && filteredSources.length === 0 && (
          <Panel className="p-10 text-center text-sm text-muted-foreground">
            {sources.length === 0
              ? "No data sources yet. Add them under Configure Libraries, then configure checks against them."
              : "No sources match these filters."}
          </Panel>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredSources.map(source => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>
      </div>
    </div>
  );
}
function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-muted/40 p-2">
      <div className={cn("rounded-[22px] bg-card shadow-soft ring-1 ring-border/60", className)}>{children}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  items,
  onValueChange,
}: {
  label: string;
  value: string;
  items: string[];
  onValueChange: (value: string) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={v => {
        if (!v) return;
        onValueChange(v);
      }}>
      <SelectTrigger label={label} className="h-11 rounded-2xl bg-background">
        <SelectValue />
      </SelectTrigger>

      <SelectContent>
        {items.map(item => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MiniMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning";
}) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";

  return (
    <div className="rounded-2xl bg-card px-4 py-3 ring-1 ring-border/60">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", color)}>{value}</p>
    </div>
  );
}

function SourceCard({ source }: { source: DqCheckSource }) {
  // A source with no configs has no pass rate; dividing by zero rendered "NaN%"
  // and a progress bar with width "NaN%".
  const passRate = source.checks === 0 ? 0 : Math.round((source.active / source.checks) * 100);

  return (
    <Panel className="group overflow-hidden p-0">
      <div className="w-full p-5 text-left">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <HugeiconsIcon icon={Database01Icon} size={22} />
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">{source.name}</h2>
              {/* A source serves however many workstreams its checks belong to -- not
                  the single value the mock assumed. */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {source.workstreams.length === 0 ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    No checks configured
                  </span>
                ) : (
                  source.workstreams.map(name => (
                    <span
                      key={name}
                      className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {name}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <StatBox label="Total" value={source.checks} />
          <StatBox label="Active" value={source.active} tone="success" />
          <StatBox label="Issues" value={source.failed} tone="warning" />
        </div>

        <div className="mt-5 rounded-2xl bg-muted/35 p-4 ring-1 ring-border/50">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Pass Rate</span>
            <span className="text-sm font-semibold text-foreground">{passRate}%</span>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-success" style={{ width: `${passRate}%` }} />
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">Last run {relativeTime(source.lastRun)}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function StatBox({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning";
}) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";

  return (
    <div className="rounded-2xl bg-muted/35 p-3 ring-1 ring-border/50">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold", color)}>{value}</p>
    </div>
  );
}

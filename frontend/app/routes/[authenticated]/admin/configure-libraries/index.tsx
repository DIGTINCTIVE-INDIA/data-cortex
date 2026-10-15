"use client";

import PageHeader from "@/components/layout/PageHeader";
import { AnimatedTabs } from "@/components/ui/custom/AnimatedTabs";
import { ArrowRight02Icon, DatabaseIcon, LayersIcon, TargetIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import LibrarySection from "./components/LibrarySection";

type TabValue = "category" | "workstream" | "downstream" | "datasource";

export default function ConfigureLibraries() {
  const [tab, setTab] = useState<TabValue>("category");

  return (
    <>
      <PageHeader
        title="Library Configuration"
        description="Manage reusable LOV values used across QC configuration flows."
      />

      <div className="rounded-3xl bg-muted/40 p-2">
        <div className="rounded-[22px] bg-background shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border/50 px-5 py-4 md:flex-row md:items-center md:justify-between">
            {/* LEFT */}
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <HugeiconsIcon icon={LayersIcon} size={18} />
              </div>

              <div>
                <h2 className="text-sm font-semibold text-foreground">Configure LOV</h2>
                <p className="text-xs text-muted-foreground">Add and manage library values</p>
              </div>
            </div>

            {/* RIGHT - FIXED TABS */}
            <div className="flex justify-center md:justify-end w-full md:w-auto">
              <AnimatedTabs
                value={tab}
                onValueChange={v => setTab(v as TabValue)}
                tabs={[
                  {
                    value: "category",
                    label: (
                      <>
                        <HugeiconsIcon icon={LayersIcon} size={16} className="ml-4" />
                        Category
                      </>
                    ),
                  },
                  {
                    value: "workstream",
                    label: (
                      <>
                        <HugeiconsIcon icon={TargetIcon} size={16} className="ml-4" />
                        Workstream
                      </>
                    ),
                  },
                  {
                    value: "downstream",
                    label: (
                      <>
                        <HugeiconsIcon icon={ArrowRight02Icon} size={16} className="ml-4" />
                        Downstream
                      </>
                    ),
                  },
                  {
                    value: "datasource",
                    label: (
                      <>
                        <HugeiconsIcon icon={DatabaseIcon} size={16} className="ml-4" />
                        Data Source
                      </>
                    ),
                  },
                ]}
              />
            </div>
          </div>

          <div className="p-6">
            {tab === "category" && (
              <LibrarySection
                type="category"
                title="Category"
                description="Organize checks, rules, and business labels."
                icon={LayersIcon}
                iconClassName="bg-[color:var(--purple)]/10 text-[var(--purple)]"
              />
            )}
            {tab === "workstream" && (
              <LibrarySection
                type="workstream"
                title="Workstream"
                description="Manage business workflows and operational streams."
                icon={TargetIcon}
                iconClassName="bg-[color:var(--indigo)]/10 text-[var(--indigo)]"
              />
            )}
            {tab === "downstream" && (
              <LibrarySection
                type="impacted_downstream"
                title="Downstream"
                description="Track impacted systems, reports, and consuming apps."
                icon={ArrowRight02Icon}
                iconClassName="bg-[color:var(--teal)]/10 text-[var(--teal)]"
              />
            )}
            {tab === "datasource" && (
              <LibrarySection
                type="data_source"
                title="Data Source"
                description="Maintain data source labels used across quality checks."
                icon={DatabaseIcon}
                iconClassName="bg-[color:var(--amber)]/10 text-[var(--amber)]"
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

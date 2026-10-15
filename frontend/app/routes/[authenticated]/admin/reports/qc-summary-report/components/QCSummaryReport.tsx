import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { AnimatedTabs } from "@/components/ui/custom/AnimatedTabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApi } from "@/lib/useApi";
import { Download01Icon, TaskDone01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import type { TabValue } from "../constants";
import QCSummaryTable from "./QCSummaryTable";
import { Panel, SectionTitle } from "./ReusableComponents";
import SummarySection from "./SummarySection";

function QCSummaryReport() {
  const [tab, setTab] = useState<TabValue>("batch");
  const [workstream, setWorkstream] = useState<string>("all");
  const { data: libraries } = useApi("GET /api/libraries/qc-tags/all");
  const allWorkstreams = libraries?.data?.workstream || [];

  const workstreamOptions = useMemo(() => {
    return [
      {
        label: "All Workstreams",
        value: "all",
      },

      ...allWorkstreams.map((item: any) => ({
        label: item.tagTitle,
        value: String(item.id),
      })),
    ];
  }, [allWorkstreams]);

  const periodMap: Record<TabValue, string> = {
    batch: "current_batch",
    week: "current_week",
    month: "current_month",
  };

  const { data, isLoading } = useApi("GET /api/reports/qc-summary", {
    query: {
      period: periodMap[tab],
      workstream: workstream === "all" ? undefined : Number(workstream),
    },
  });

  //   console.log("response", data);
  //   console.log("Response >>", data?.data.rows);

  const rows = data?.data?.rows || [];
  const totals = data?.data?.total;

  const handleExportCSV = () => {
    if (!rows.length && !totals) return;

    const csvData = [
      ...rows.map(row => ({
        Workstream: row.workstream,
        "Checks Executed": row.checksExecuted,
        "Checks Passed": row.checksPassed,
        "Checks Failed": row.checksFailed,
        "Pass Rate": `${row.passRate}%`,
        "Recurring Issues": row.recurringIssues,
        "Downstream Impacted": row.downstreamImpacted.join(", "),
      })),

      {
        Workstream: totals?.workstream || "Total",
        "Checks Executed": totals?.checksExecuted ?? 0,
        "Checks Passed": totals?.checksPassed ?? 0,
        "Checks Failed": totals?.checksFailed ?? 0,
        "Pass Rate": `${totals?.passRate ?? 0}%`,
        "Recurring Issues": totals?.recurringIssues ?? 0,
        "Downstream Impacted": totals?.downstreamImpacted?.join(", ") || "",
      },
    ];

    const headers = Object.keys(csvData[0]);

    const csvRows = [
      headers.join(","),

      ...csvData.map(row =>
        headers
          .map(header => {
            const cell = row[header as keyof typeof row];

            const escaped = String(cell ?? "").replace(/"/g, '""');

            return `"${escaped}"`;
          })
          .join(",")
      ),
    ];

    const csvString = csvRows.join("\n");

    const blob = new Blob([csvString], {
      type: "text/csv;charset=utf-8;",
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `qc-summary-report-${tab}-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);

    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      {/* QC PAGE HEADER */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader
          title="QC Summary Report"
          description="Generate and schedule QC execution summary reports for business teams"
        />
        {/* <Button
            onClick={() => setOpen(true)}
            className="h-10 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
            <HugeiconsIcon icon={Add01Icon} size={16} />
            Schedule Report
          </Button> */}
      </div>

      <Panel className="p-5">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <SectionTitle icon={TaskDone01Icon} title="QC Execution Summary" />

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-end">
            <Select
              value={workstream}
              onValueChange={value => {
                if (value) {
                  setWorkstream(value);
                }
              }}>
              <SelectTrigger label="Filter by Workstream" className="h-11 w-[260px] rounded-2xl bg-card">
                <SelectValue placeholder="Select workstream">
                  {workstreamOptions.find(item => item.value === workstream)?.label}
                </SelectValue>
              </SelectTrigger>

              <SelectContent>
                {workstreamOptions.map(item => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="shrink-0">
              <AnimatedTabs
                value={tab}
                btnClassName="min-w-[140px]"
                onValueChange={value => setTab(value as TabValue)}
                tabs={[
                  {
                    value: "batch",
                    label: "Current Batch",
                  },
                  {
                    value: "week",
                    label: "Current Week",
                  },
                  {
                    value: "month",
                    label: "Current Month",
                  },
                ]}
              />
            </div>
          </div>
        </div>

        {/* QC SMMARY SECTION */}
        <SummarySection totals={totals} />

        {/* QC REPORT TABLE */}
        <QCSummaryTable rows={rows} totals={totals} />

        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            className="h-10 rounded-xl bg-background"
            onClick={handleExportCSV}
            disabled={isLoading || !rows.length}>
            <HugeiconsIcon icon={Download01Icon} size={16} />
            Export Report
          </Button>
        </div>
      </Panel>

      {/* <ScheduleReportDialog open={open} onOpenChange={setOpen} /> */}
    </>
  );
}
export default QCSummaryReport;

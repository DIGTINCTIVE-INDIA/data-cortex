import { Button } from "@/components/ui/button";
import { AnimatedTabs } from "@/components/ui/custom/AnimatedTabs";
import { useDialog } from "@/hooks/useDialog";
import { useApi } from "@/lib/useApi";
import { useMemo, useState } from "react";
import { MemoEChart } from "../../dashboard/components/Chart";
import { useChartTheme } from "../../dashboard/hooks/useChartTheme";
import buildCheckHistoryChart from "../utils/buildCheckHistoryChart";
import { useNavigate } from "react-router";

type CheckDetailsDialogProps = {
  qcId: number | null;
};

export default function CheckDetailsDialog({ qcId }: CheckDetailsDialogProps) {
  const { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, open, setOpen } = useDialog();

  const navigate = useNavigate();

  const c = useChartTheme();

  const [view, setView] = useState<"last10" | "last20" | "weekly" | "monthly">("last10");

  const detailsRes = useApi("GET /api/analyse-workstreams/checks/:id/details", {
    enabled: open && qcId != null,
    params: {
      id: qcId!,
    },
    query: {
      view,
    },
  });

  const summary = detailsRes.data?.data?.summary;
  const history = detailsRes.data?.data?.runHistory ?? [];

  const chart = useMemo(
    () =>
      buildCheckHistoryChart({
        history,
        view,
        colors: {
          success: c.success,
          destructive: c.destructive,
        },
      }),
    [history, view, c]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" className="h-9 rounded-xl">
          {/* <HugeiconsIcon icon={EyeIcon} size={16} /> */}
          View Details
        </Button>
      </DialogTrigger>

      <DialogContent className="!w-[95vw] !max-w-6xl max-h-[90vh] overflow-hidden overflow-y-auto p-0">
        {/* Header */}
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="text-2xl font-semibold">Check Details</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            View detailed information about this quality check including run history and data comparison
          </p>
        </DialogHeader>

        <div className="flex-1 space-y-8 overflow-y-auto p-6">
          {" "}
          {/* ================= Run History ================= */}
          <section>
            <div className="mb-5 flex items-center justify-between">
              <div className="text-lg font-semibold">Run History</div>

              <div className="flex flex-1 items-center justify-end gap-6">
                {/* <div className="flex items-center gap-6"> */}
                <AnimatedTabs
                  value={view}
                  onValueChange={value => setView(value as "last10" | "last20" | "weekly" | "monthly")}
                  tabs={[
                    {
                      value: "last10",
                      label: "Last 10 Batch Run",
                    },
                    {
                      value: "last20",
                      label: "Last 20 Batch Run",
                    },
                    {
                      value: "weekly",
                      label: "Weekly Trend",
                    },
                    {
                      value: "monthly",
                      label: "Monthly Trend",
                    },
                  ]}
                />

                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full bg-success" />
                    Passed
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full bg-destructive" />
                    Failed
                  </div>
                </div>
              </div>
            </div>

            {detailsRes.isLoading ? (
              <div className="h-[360px] animate-pulse rounded-xl bg-muted/40" />
            ) : (
              <div className="h-[360px] rounded-xl border bg-background">
                {/* <div className="overflow-hidden rounded-xl border bg-background"> */}
                <MemoEChart option={chart} height={360} />
              </div>
            )}
          </section>
          {/* ================= Source Data ================= */}
          {(view === "last10" || view === "last20") && (
            <section>
              <h3 className="mb-4 text-lg font-semibold">Source Data Comparison</h3>

              {detailsRes.isLoading ? (
                <div className="h-60 animate-pulse rounded-xl bg-muted/40" />
              ) : (
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full">
                    <thead className="bg-muted/40 text-sm text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Status</th>
                        <th className="px-4 py-3 text-left font-medium">Date</th>
                        <th className="px-4 py-3 text-left font-medium">Passed Records</th>
                        <th className="px-4 py-3 text-left font-medium">Total Records</th>
                        <th className="px-4 py-3 text-left font-medium">Failed Records</th>
                        <th className="px-4 py-3 text-left font-medium">Failure Reason</th>
                        <th className="px-4 py-3 text-right font-medium">View Data</th>
                      </tr>
                    </thead>

                    <tbody>
                      {history.map((row: any) => (
                        <tr key={row.executionId} className="border-t border-border">
                          <td className="px-4 py-4">
                            {/*
                              Test for the exact status. An else-branch meaning "Failed"
                              would render our own errors as the client's data failing.
                            */}
                            {row.status === "passed" || row.status === "failed" ? (
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                                  row.status === "passed"
                                    ? "bg-success/10 text-success"
                                    : "bg-destructive/10 text-destructive"
                                }`}>
                                {row.status === "passed" ? "Passed" : "Failed"}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-sm">
                            {new Date(row.date).toLocaleString("en-IN")}
                          </td>

                          <td className="px-4 py-4 font-medium">{row.passed.toLocaleString()}</td>

                          <td className="px-4 py-4 font-medium">{row.total.toLocaleString()}</td>

                          <td className="px-4 py-4 font-medium text-destructive">{row.failed.toLocaleString()}</td>

                          <td className="max-w-sm px-4 py-4 text-sm text-muted-foreground">{row.failureReason}</td>

                          <td className="px-4 py-4 text-right">
                            <div className="flex flex-col items-end">
                              <Button
                                onClick={() => navigate("/investigate/database-explorer")}
                                variant="link"
                                size="sm"
                                className="h-auto justify-end p-0">
                                View All Error Records
                              </Button>

                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

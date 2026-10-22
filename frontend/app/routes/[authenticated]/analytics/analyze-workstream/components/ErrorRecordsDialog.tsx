import { Button } from "@/components/ui/button";
import { useDialog } from "@/hooks/useDialog";
import { useApi } from "@/lib/useApi";

type ErrorRecordsDialogProps = {
  executionId: number;
  failedCount?: number;
};

const show = (value: unknown) => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

// The engine writes a few bookkeeping columns beside the source columns. Showing them first
// buries the data the reader came for, so they go last.
const isBookkeeping = (key: string) => key.startsWith("_");

export default function ErrorRecordsDialog({ executionId, failedCount }: ErrorRecordsDialogProps) {
  const { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, open, setOpen } = useDialog();

  const res = useApi("GET /api/analyse-workstreams/checks/:id/top-error-records", {
    enabled: open,
    params: { id: executionId },
    query: { limit: 100 },
  });

  const data = res.data?.data;
  const rows: Record<string, unknown>[] = data?.rows ?? [];
  const columns: { key: string; label: string }[] = [...(data?.columns ?? [])].sort(
    (a, b) => Number(isBookkeeping(a.key)) - Number(isBookkeeping(b.key))
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="link" size="sm" className="h-auto justify-end p-0">
          View All Error Records
        </Button>
      </DialogTrigger>

      <DialogContent className="!w-[95vw] !max-w-6xl max-h-[85vh] overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="text-xl font-semibold">Error Records</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {res.isLoading
              ? "Loading records..."
              : rows.length
                ? `Showing ${rows.length.toLocaleString()}${data?.hasMore || (failedCount ?? 0) > rows.length ? ` of ${(failedCount ?? rows.length).toLocaleString()}` : ""} records this check rejected.`
                : "Records this check rejected."}
          </p>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-auto p-6">
          {res.isLoading ? (
            <div className="h-60 animate-pulse rounded-xl bg-muted/40" />
          ) : res.isError ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              The error records could not be loaded. Check that the target connection is reachable and try again.
            </p>
          ) : !rows.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {data?.note ?? "No error records were stored for this run."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr>
                    {columns.map(c => (
                      <th key={c.key} className="whitespace-nowrap px-4 py-3 text-left font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      {columns.map(c => (
                        <td key={c.key} className="max-w-[260px] truncate whitespace-nowrap px-4 py-2.5 font-mono text-xs" title={show(row[c.key])}>
                          {show(row[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

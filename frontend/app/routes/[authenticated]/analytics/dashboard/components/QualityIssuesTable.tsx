import { memo } from "react";
import { EmptyState } from "./EmptyState";

const QualityIssuesTable = memo(({ rows }: { rows: any[] }) => {
  if (!rows.length) return <EmptyState message="No quality issues found." />;

  return (
    <div className="overflow-auto rounded-2xl ring-1 ring-border/60">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            {["Workstream", "Total Checks", "Total Issues", "High", "Medium", "Low"].map(h => (
              <th key={h} className="px-4 py-3 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map(row => (
            <tr key={row.workstreamId} className="border-t border-border/60 hover:bg-muted/30">
              <td className="px-4 py-3 font-medium text-primary">{row.workstream}</td>
              <td className="px-4 py-3 text-foreground">{Number(row.totalChecks).toLocaleString()}</td>
              <td className="px-4 py-3 text-foreground">{Number(row.totalIssues).toLocaleString()}</td>
              <td className="px-4 py-3 text-destructive">{Number(row.high).toLocaleString()}</td>
              <td className="px-4 py-3 text-warning">{Number(row.medium).toLocaleString()}</td>
              <td className="px-4 py-3 text-success">{Number(row.low).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default QualityIssuesTable;

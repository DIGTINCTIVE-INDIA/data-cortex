// import { TableHead } from '@/components/ui/table'
import type { QcSummaryReportRow, QcSummaryReportTotal } from "@/lib/useApi/types/reportsApis.types";
import { Badge, TableCell, TableHead } from "./ReusableComponents";

type Props = {
  rows: QcSummaryReportRow[];
  totals: QcSummaryReportTotal | undefined;
};

const QCSummaryTable = ({ rows, totals }: Props) => {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/40 bg-background">
      <table className="w-full text-sm">
        <thead className="bg-muted/30 text-muted-foreground">
          <tr>
            <TableHead>Workstream</TableHead>
            <TableHead>Checks Executed</TableHead>
            <TableHead>Checks Passed</TableHead>
            <TableHead>Checks Failed</TableHead>
            <TableHead>Pass Rate</TableHead>
            <TableHead>Recurring Issues</TableHead>
            <TableHead>Downstream Impacted</TableHead>
          </tr>
        </thead>

        <tbody>
          {rows.map(row => (
            <tr key={row.workstream} className="border-t border-border/40 hover:bg-muted/20">
              <TableCell className="font-semibold">{row.workstream}</TableCell>
              <TableCell>{row.checksExecuted}</TableCell>
              <TableCell className="font-semibold ">{row.checksPassed}</TableCell>
              <TableCell className="font-semibold text-destructive">{row.checksFailed}</TableCell>
              <TableCell>{row.passRate}%</TableCell>
              <TableCell className="font-semibold ">{row.recurringIssues}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  {row.downstreamImpacted.map(item => (
                    <Badge key={item}>{item}</Badge>
                  ))}
                </div>
              </TableCell>
            </tr>
          ))}

          <tr className="border-t border-border/40 bg-warning/8 font-semibold">
            <TableCell>Total</TableCell>
            <TableCell>{totals?.checksExecuted ?? 0}</TableCell>
            <TableCell className="text-success">{totals?.checksPassed ?? 0}</TableCell>
            <TableCell className="text-destructive">{totals?.checksFailed ?? 0}</TableCell>
            <TableCell>{totals?.passRate ?? 0}%</TableCell>
            <TableCell className="text-warning">{totals?.recurringIssues ?? 0}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-2">
                {totals?.downstreamImpacted?.map(item => (
                  <Badge key={item}>{item}</Badge>
                ))}
              </div>
            </TableCell>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default QCSummaryTable;

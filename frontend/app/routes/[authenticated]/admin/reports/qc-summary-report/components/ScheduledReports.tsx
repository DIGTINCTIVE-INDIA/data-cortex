// import { Button } from "@/components/ui/button";
// import { cn } from "@/lib/utils";
// import { Calendar03Icon, Delete02Icon, Edit02Icon } from "@hugeicons/core-free-icons";
// import { HugeiconsIcon } from "@hugeicons/react";
// import { Badge, Panel, SectionTitle, TableCell, TableHead } from "./ReusableComponents";

// const frequencies = ["Current Batch", "Daily", "Weekly", "Monthly"] as const;
// export type Frequency = (typeof frequencies)[number];

// type ScheduledReport = {
//   id: string;
//   name: string;
//   frequency: Frequency;
//   workstreams: Exclude<Workstream, "All Workstreams">[];
//   distributionList: string[];
//   status: "Active" | "Paused";
// };

// const scheduledReports: ScheduledReport[] = [
//   {
//     id: "SCH-001",
//     name: "Weekly Sales QC Summary",
//     frequency: "Current Batch",
//     workstreams: ["Sales", "Marketing"],
//     distributionList: ["asadansari.aa786@gmail.com", "sales-qc-dl@company.com", "marketing-ops@company.com"],
//     status: "Active",
//   },
//   {
//     id: "SCH-002",
//     name: "Monthly Executive QC Report",
//     frequency: "Monthly",
//     workstreams: ["Sales", "Marketing", "SP", "Activity"],
//     distributionList: ["leadership-dl@company.com", "data-quality@company.com"],
//     status: "Active",
//   },
//   {
//     id: "SCH-003",
//     name: "Daily Failed Checks Digest",
//     frequency: "Daily",
//     workstreams: ["SP", "Activity"],
//     distributionList: ["dq-alerts@company.com"],
//     status: "Paused",
//   },
// ];

// export const ScheduledReports = () => {
//   return (
//     <Panel className="p-5">
//       <div className="mb-5 flex items-center justify-between gap-4">
//         <SectionTitle icon={Calendar03Icon} title="Scheduled Reports" />
//         <Badge>{scheduledReports.length} schedules</Badge>
//       </div>

//       <div className="overflow-hidden rounded-2xl border border-border/40 bg-background">
//         <table className="w-full text-sm">
//           <thead className="bg-muted/30 text-muted-foreground">
//             <tr>
//               <TableHead>Schedule Name</TableHead>
//               <TableHead>Frequency</TableHead>
//               <TableHead>Workstreams</TableHead>
//               <TableHead>Distribution List</TableHead>
//               <TableHead>Status</TableHead>
//               <TableHead className="text-right">Actions</TableHead>
//             </tr>
//           </thead>

//           <tbody>
//             {scheduledReports.map(report => (
//               <tr key={report.id} className="border-t border-border/40 hover:bg-muted/20">
//                 <TableCell>
//                   <div>
//                     <p className="font-semibold">{report.name}</p>
//                     <p className="mt-0.5 text-xs text-muted-foreground">{report.id}</p>
//                   </div>
//                 </TableCell>

//                 <TableCell>
//                   <Badge>{report.frequency}</Badge>
//                 </TableCell>

//                 <TableCell>
//                   <div className="flex flex-wrap gap-2">
//                     {report.workstreams.map(item => (
//                       <Badge key={item}>{item}</Badge>
//                     ))}
//                   </div>
//                 </TableCell>

//                 <TableCell>
//                   <div className="flex max-w-2xl flex-wrap gap-2">
//                     {report.distributionList.map(email => (
//                       <Badge key={email}>{email}</Badge>
//                     ))}
//                   </div>
//                 </TableCell>

//                 <TableCell>
//                   <StatusBadge status={report.status} />
//                 </TableCell>

//                 <TableCell>
//                   <div className="flex justify-end gap-2">
//                     <Button
//                       variant="ghost"
//                       size="icon"
//                       className="h-9 w-9 rounded-xl text-muted-foreground hover:text-primary">
//                       <HugeiconsIcon icon={Edit02Icon} size={17} />
//                     </Button>

//                     <Button
//                       variant="ghost"
//                       size="icon"
//                       className="h-9 w-9 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive">
//                       <HugeiconsIcon icon={Delete02Icon} size={17} />
//                     </Button>
//                   </div>
//                 </TableCell>
//               </tr>
//             ))}
//           </tbody>
//         </table>
//       </div>
//     </Panel>
//   );
// };

// ScheduledReports;

// function StatusBadge({ status }: { status: ScheduledReport["status"] }) {
//   return (
//     <span
//       className={cn(
//         "rounded-full px-3 py-1 text-xs font-semibold",
//         status === "Active" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
//       )}>
//       {status}
//     </span>
//   );
// }

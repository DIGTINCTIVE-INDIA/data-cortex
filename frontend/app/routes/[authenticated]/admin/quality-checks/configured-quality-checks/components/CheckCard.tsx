// import { Button } from "@/components/ui/button";
// import { useApi } from "@/lib/useApi";
// import { cn } from "@/lib/utils";
// import { Database01Icon, PlayIcon, SearchList01Icon, SourceCodeCircleIcon } from "@hugeicons/core-free-icons";
// import { HugeiconsIcon } from "@hugeicons/react";
// import React from "react";
// import DbViewDialog from "./DbViewDialog";
// import DeleteDBDialog from "./DeleteDBDialog";
// import EditQcDialog from "./EditDbDialog";

// const CheckCard = ({ item }: { item: any }) => {
//   const { mutateAsync, isPending } = useApi("PATCH /api/qc-configuration/db/update-check", {
//     query: {
//       configId: item.configId,
//     },
//   });
//   return (
//     <div className="rounded-2xl bg-background p-4 ring-1 ring-border/60 transition hover:bg-muted/25 hover:ring-primary/30">
//       <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
//         <div className="flex min-w-0 items-start gap-3">
//           <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
//             <HugeiconsIcon
//               icon={
//                 item.type === "sql" ? SourceCodeCircleIcon : item.type === "kpi" ? SearchList01Icon : Database01Icon
//               }
//               size={20}
//             />
//           </div>

//           <div className="min-w-0">
//             <div className="flex flex-wrap items-center gap-2">
//               <h3 className="text-base font-semibold text-foreground">{item.configName}</h3>

//               <Badge>{item.configId}</Badge>

//               <Badge tone="warning">{item.workstream}</Badge>
//             </div>

//             <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
//               <Meta label="Source Connection" value={item.sourceConnectionId} />

//               <Meta label="Target Connection" value={item.targetConnectionId} />

//               <Meta label="Schema" value={item.schemaTableName} />

//               <Meta label="Table Prefix" value={item.targetTablePrefix} />

//               <Meta label="Landing Table" value={item.landingTable ? item.landingTableName : "Disabled"} />
//             </div>
//           </div>
//         </div>

//         <div className="flex flex-wrap gap-2 xl:justify-end">
//           <Button className="h-9 rounded-xl">
//             <HugeiconsIcon icon={PlayIcon} size={16} />
//             Run
//           </Button>

//           <DbViewDialog item={item} />

//           <EditQcDialog item={item} />

//           <DeleteDBDialog configId={item.configId} disabled={isPending} />
//         </div>
//       </div>
//     </div>
//   );
// };

// export default CheckCard;

// function Badge({
//   children,
//   tone = "default",
// }: {
//   children: React.ReactNode;
//   tone?: "default" | "warning" | "success";
// }) {
//   const className =
//     tone === "warning"
//       ? "bg-warning/10 text-warning"
//       : tone === "success"
//         ? "bg-success/10 text-success"
//         : "bg-muted text-muted-foreground";

//   return <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", className)}>{children}</span>;
// }

// function Meta({ label, value }: { label: string; value: string }) {
//   return (
//     <span>
//       <span className="font-medium text-foreground/80">{label}:</span> <span>{value}</span>
//     </span>
//   );
// }

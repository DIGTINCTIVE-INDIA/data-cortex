// import { useApi } from "@/lib/useApi";
// import { toApiNumber, toQcAlertPeriod } from "..";

// type Props = {
//   params: any;
//   baseQuery: any;
//   issueBucket: string;
//   issueGroupBy: string;
// };
// export function useDashboardData({ params, baseQuery, issueBucket, issueGroupBy }: Props) {
//   const libraries = useApi("GET /api/libraries/qc-tags/all");
//   const summary = useApi("GET /api/dashboard/summary", { query: baseQuery });
//   const status = useApi("GET /api/dashboard/issues-status", { query: baseQuery });
//   const sources = useApi("GET /api/dashboard/issues-by-source", { query: baseQuery });
//   const trend = useApi("GET /api/dashboard/issues-trend", {
//     query: { ...baseQuery, bucket: issueBucket, groupBy: issueGroupBy },
//   });
//   const table = useApi("GET /api/dashboard/issues-table", { query: baseQuery });

//   const recentAlerts = useApi("GET /api/reports/qc-alerts", {
//     query: {
//       status: "open",
//       period: toQcAlertPeriod(params.time_period) as any,
//       workstream: toApiNumber(params.workstream),
//       impactedDownstream: toApiNumber(params.downstream),
//     },
//   });

//   return {
//     libraries,
//     summary,
//     status,
//     sources,
//     trend,
//     table,
//     recentAlerts,
//   };
// }

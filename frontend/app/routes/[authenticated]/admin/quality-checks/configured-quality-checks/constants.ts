// "kpi" stays in the union so an old bookmark or a stored tab value still parses;
// it simply has no tab to land on and falls back to the first one.
export type TabValue = "dataconform" | "sql" | "kpi";

export const configuredCheckTabs = [
  {
    value: "dataconform",
    label: "Data Conformance Checks",
  },
  {
    value: "sql",
    label: "Custom SQL Checks",
  },
];

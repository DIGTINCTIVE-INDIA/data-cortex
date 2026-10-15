import { CodeIcon, DatabaseIcon, FileIcon } from "@hugeicons/core-free-icons";

export const cards = [
  {
    title: "Custom SQL Check",
    desc: "Write SQL rules to identify failed records and generate exception outputs.",
    route: "/admin/quality-checks/qc-configuration/custom-sql",
    icon: CodeIcon,
    color: "var(--indigo)",
    meta: ["SQL based rule", "Failure query", "Custom message"],
    statsLabel: "Best for",
    statsValue: "Business logic",
  },
  {
    title: "Data Conformance (File)",
    desc: "Validate uploaded files against schema files before loading into downstream tables.",
    route: "/admin/quality-checks/qc-configuration/data-conformance/file",
    icon: FileIcon,
    color: "var(--teal)",
    meta: ["CSV / Excel / JSON", "Schema file", "Landing table"],
    statsLabel: "Source",
    statsValue: "File storage",
  },
  {
    title: "Data Conformance (Database)",
    desc: "Compare database source tables against expected schema and generate conformed outputs.",
    route: "/admin/quality-checks/qc-configuration/data-conformance/db",
    icon: DatabaseIcon,
    color: "var(--primary)",
    meta: ["Source table", "Target prefix", "DB connection"],
    statsLabel: "Source",
    statsValue: "Database",
  },
];

import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";
export default [
  index("routes/index.tsx"),
  layout("routes/[unauthenticated]/layout.tsx", [route("login", "routes/[unauthenticated]/login.tsx")]),

  layout("routes/[authenticated]/layout.tsx", [
    route("admin/connections/db-connections", "routes/[authenticated]/admin/connections/db-connections/index.tsx"),
    route("admin/connections/email-notifications", "routes/[authenticated]/admin/connections/email-notifications/index.tsx"),
    route("investigate/jobs", "routes/[authenticated]/investigate/jobs/index.tsx"),

    route(
      "admin/quality-checks/configured-quality-checks",
      "routes/[authenticated]/admin/quality-checks/configured-quality-checks/index.tsx"
    ),
    route("admin/quality-checks/dq-checks-lib", "routes/[authenticated]/admin/quality-checks/dq-checks-lib/index.tsx"),
    route(
      "admin/quality-checks/qc-configuration/custom-sql",
      "routes/[authenticated]/admin/quality-checks/qc-configuration/custom-sql/index.tsx"
    ),
    route(
      "admin/quality-checks/qc-configuration/data-conformance/db",
      "routes/[authenticated]/admin/quality-checks/qc-configuration/data-conformance/db/index.tsx"
    ),
    route(
      "admin/quality-checks/qc-configuration/data-conformance/db/column-mapping",
      "routes/[authenticated]/admin/quality-checks/qc-configuration/data-conformance/db/column-mapping/index.tsx"
    ),
    layout("routes/[authenticated]/admin/quality-checks/qc-configuration/data-conformance/file/layout.tsx", [
      route(
        "admin/quality-checks/qc-configuration/data-conformance/file",
        "routes/[authenticated]/admin/quality-checks/qc-configuration/data-conformance/file/index.tsx"
      ),
      route(
        "admin/quality-checks/qc-configuration/data-conformance/file/column-mapping",
        "routes/[authenticated]/admin/quality-checks/qc-configuration/data-conformance/file/column-mapping/index.tsx"
      ),
    ]),

    route("admin/quality-checks/qc-configuration", "routes/[authenticated]/admin/quality-checks/qc-configuration/index.tsx"),

    route("admin/reports/qc-summary-report", "routes/[authenticated]/admin/reports/qc-summary-report/index.tsx"),
    route("admin/user-management", "routes/[authenticated]/admin/user-management/index.tsx"),
    route("admin/configure-libraries", "routes/[authenticated]/admin/configure-libraries/index.tsx"),

    route("analytics/analyze-workstream", "routes/[authenticated]/analytics/analyze-workstream/index.tsx"),
    route("analytics/dashboard", "routes/[authenticated]/analytics/dashboard/index.tsx"),

    route("investigate/database-explorer", "routes/[authenticated]/investigate/database-explorer/index.tsx"),
    route("investigate/qc-alerts", "routes/[authenticated]/investigate/qc-alerts/index.tsx"),
  ]),
] satisfies RouteConfig;

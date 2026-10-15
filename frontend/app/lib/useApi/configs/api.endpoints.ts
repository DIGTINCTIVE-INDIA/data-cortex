export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type Endpoint = `${HttpMethod} ${string}`;

const define = <T extends readonly Endpoint[]>(arr: T) => arr;

export const Endpoints = {
  authenticationApis: define([
    "GET /api/auth/sso/url",
    "POST /api/auth/sso/exchange-code",
    "GET /api/auth/token",
    "POST /api/auth/logout",
  ]),
  userManagementApis: define([
    "GET /api/user/list-users",
    "POST /api/user/add-user",
    "POST /api/user/update-user",
    "PATCH /api/user/toggle-user",
  ]),

  librariesApis: define([
    "GET /api/libraries/qc-tags/all",
    "GET /api/libraries/dq-checks/sources",
    "GET /api/libraries/qc-tags/:type",
    "POST /api/libraries/qc-tags/create",
    "PATCH /api/libraries/qc-tags/update",
    "PATCH /api/libraries/qc-tags/toggle",
  ]),

  connections: define([
    // DB storage
    "GET /api/db/connections/list",
    "POST /api/db/connections/add",
    "PATCH /api/db/connections/update",
    "PATCH /api/db/connections/toggle",
    "GET /api/db/connections/tables",
    "GET /api/db/connections/columns",
    "GET /api/db/connections/list?page=1&limit=500",

    // File Storage
    "GET /api/file-storage/connections/list",
    "POST /api/file-storage/connections/add",
    "PATCH /api/file-storage/connections/update",
    "PATCH /api/file-storage/connections/toggle",
    "GET /api/file-storage/connections/list?page=1&limit=500",
  ]),

  qcConfiguration: define([
    // DB QC Check Configurations
    "POST /api/qc-configuration/db/create-check",
    "PATCH /api/qc-configuration/db/update-check",
    "PATCH /api/qc-configuration/db/toggle-check",
    "POST /api/qc-configuration/db/set-columns",
    "GET /api/qc-configuration/db/list-columns",
    "GET /api/qc-configuration/db/list-checks",

    // QC File Storage Check Configurations
    "POST /api/qc-configuration/file-storage/get-schema",
    "POST /api/qc-configuration/file-storage/create-check",
    "PATCH /api/qc-configuration/file-storage/update-check",
    "PATCH /api/qc-configuration/file-storage/toggle-check",
    "GET /api/qc-configuration/file-storage/list-checks",

    // QC Custom SQL Check Configurations
    "POST /api/qc-configuration/custom-sql/validate-query",
    "POST /api/qc-configuration/custom-sql/create-check",
    "PATCH /api/qc-configuration/custom-sql/update-check",
    "PATCH /api/qc-configuration/custom-sql/toggle-check",
    "GET /api/qc-configuration/custom-sql/list-checks",
    "GET /api/qc-configuration/custom-sql/schema",

    // Run a configured check
    "POST /api/qc-configuration/run",
  ]),

  databaseExplorer: define(["POST /api/db-explorer/execute-query"]),

  reports: define(["GET /api/reports/qc-summary"]),

  qcAlerts: define([
    "GET /api/reports/qc-alerts",
    "GET /api/reports/qc-alerts/summary",
    "PATCH /api/reports/qc-alerts/:id/status",
  ]),

  dashboard: define([
    "GET /api/dashboard/summary",
    "GET /api/dashboard/issues-status",
    "GET /api/dashboard/issues-by-source",
    "GET /api/dashboard/issues-trend",
    "GET /api/dashboard/issues-table",
  ]),
  notifications: define([
    "GET /api/notifications/rules?page=1&limit=500",
    "POST /api/notifications/rules",
    "PATCH /api/notifications/rules",
    "PATCH /api/notifications/rules/toggle",
    "DELETE /api/notifications/rules",
    "POST /api/notifications/test-email",
  ]),
  jobs: define(["GET /api/jobs", "GET /api/jobs/:runId"]),
  serviceUsers: define([
    "GET /api/service-users",
    "POST /api/service-users",
    "POST /api/service-users/:id/keys",
    "DELETE /api/service-users/keys/:keyId",
  ]),
  analyseWorkstream: define([
    "GET /api/analyse-workstreams/distinct-check-types",
    "GET /api/analyse-workstreams/distinct-file-table-names",
    "GET /api/analyse-workstreams/check-cards",
    "GET /api/analyse-workstreams/failed-trend",
    "GET /api/analyse-workstreams/failed-checks-table",
    "GET /api/analyse-workstreams/checks/:id/details",
    "GET /api/analyse-workstreams/checks/:id/top-error-records",
  ]),
} as const;

export type EndpointsEnum = (typeof Endpoints)[keyof typeof Endpoints][number];

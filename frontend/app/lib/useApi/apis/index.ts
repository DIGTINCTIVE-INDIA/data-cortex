import analyseWorkstreamApiConfig from "./analyseWorkstreamApis.config";
import authenticationApiConfig from "./authentication.config";
import connectionsApiConfig from "./connections.config";
import dashboardApiConfig from "./dashboard.config";
import dbExplorerApiConfig from "./dbExplorer.config";
import jobsApiConfig from "./jobs.config";
import librariesApiConfig from "./libraries.config";
import notificationsApiConfig from "./notifications.config";
import qcAlertsApiConfig from "./qcAlerts.config";
import qcConfigurationApisConfig from "./qcConfiguration.config";
import reportsApiConfig from "./reports.config";
import serviceUsersApiConfig from "./serviceUsers.config";
import userManagementApiConfig from "./userManagement.config";

export const apiConfig = {
  ...authenticationApiConfig,
  ...userManagementApiConfig,
  ...librariesApiConfig,
  ...connectionsApiConfig,
  ...qcConfigurationApisConfig,
  ...dbExplorerApiConfig,
  ...reportsApiConfig,
  ...qcAlertsApiConfig,
  ...dashboardApiConfig,
  ...analyseWorkstreamApiConfig,
  ...notificationsApiConfig,
  ...serviceUsersApiConfig,
  ...jobsApiConfig,
} as const;

export type ApiConfigType = typeof apiConfig;
export type EndpointKeys = keyof typeof apiConfig;

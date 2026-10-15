import type { UserRole } from "@/lib/useApi/types/authenticationApis.types";

/**
 * What each role may do in the UI.
 *
 * This mirrors the access matrix in core-server (apps/core-server/src/middlewares/
 * role-middleware.ts). The server is the authority and always re-checks; this exists
 * so the UI does not offer buttons that will answer 403. If the two ever disagree
 * the server wins, and the worst outcome is a button that fails with a message.
 *
 *   admin      everything
 *   engineer   configure checks and connections, run checks, view results
 *   analyst    view results, run checks
 *   service    an API identity -- it never uses the UI
 */
export type Permission = "admin" | "configure" | "run" | "view";

const GRANTS: Record<Permission, readonly UserRole[]> = {
  admin: ["admin"],
  configure: ["admin", "engineer"],
  run: ["admin", "engineer", "analyst"],
  view: ["admin", "engineer", "analyst"],
};

export const can = (role: UserRole | undefined | null, permission: Permission) =>
  Boolean(role) && GRANTS[permission].includes(role as UserRole);

/**
 * Pages, by path prefix, and what they need. The longest matching prefix wins, so a
 * specific page can be stricter than the section around it. A path matching nothing
 * is not restricted here (the server still guards its data).
 */
export const ROUTE_PERMISSIONS: readonly [prefix: string, permission: Permission][] = [
  // Covers both tabs: people and service identities.
  ["/admin/user-management", "admin"],
  ["/admin/configure-libraries", "admin"],
  // Email rules are configuration, so an engineer sets them up like connections and checks.
  ["/admin/connections/email-notifications", "configure"],
  ["/admin/connections", "configure"],
  ["/admin/quality-checks/qc-configuration", "configure"],
  ["/admin/quality-checks/configured-quality-checks", "view"],
  ["/admin/quality-checks/dq-checks-lib", "view"],
  // Read-only querying, open to every signed-in person.
  ["/investigate/database-explorer", "view"],
];

export const permissionForPath = (pathname: string): Permission | null => {
  let best: [string, Permission] | null = null;

  for (const entry of ROUTE_PERMISSIONS) {
    if (pathname === entry[0] || pathname.startsWith(entry[0] + "/")) {
      if (!best || entry[0].length > best[0].length) best = entry as [string, Permission];
    }
  }

  return best ? best[1] : null;
};

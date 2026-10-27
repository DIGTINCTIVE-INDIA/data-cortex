import type { UserRole } from "@/lib/useApi/types/authenticationApis.types";

/**
 * Roles a person can be given. "service" is deliberately absent: a service user is
 * created on the Service Users page, which also issues its API key, and its role
 * cannot be changed afterwards.
 */
export const roles = ["admin", "engineer", "analyst"] as UserRole[];

export const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  analyst: "Analyst",
  engineer: "Engineer",
  service: "Service",
};

import { ErrorResponse } from "@repo/lib/error-handlers-module";
import type { UserRoleEnum } from "@repo/db";
import { NextFunction, Request, Response } from "express";

/**
 * Allows a route only to the listed roles. Call it after authentication.
 *
 * 403, not 400: the caller is authenticated, they just may not do this. (The old
 * admin check answered 400, which a client cannot tell apart from a malformed
 * request.)
 */
export function requireRole(...allowed: UserRoleEnum[]) {
	return function (req: Request, _: Response, next: NextFunction) {
		if (!req.user) {
			throw new ErrorResponse("Unauthorized access", 401);
		}

		if (!allowed.includes(req.user.role)) {
			throw new ErrorResponse(`Requires one of: ${allowed.join(", ")}`, 403);
		}

		next();
	};
}

/** Admin only. */
export const onlyAdmin = () => requireRole("admin");

/** Whoever may change configuration: checks and connections. */
export const canConfigure = () => requireRole("admin", "engineer");

/** Whoever may look at configuration and results. Excludes service users on purpose. */
export const canView = () => requireRole("admin", "engineer", "analyst");

/** Whoever may start a check. The only thing a service user may do. */
export const canRun = () => requireRole("admin", "engineer", "analyst", "service");
